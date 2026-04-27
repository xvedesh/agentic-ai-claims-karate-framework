# Architecture (Phase 0 skeleton)

> Status: living document. Phases 1–6 delivered; later phases optional.
> Owner: Documentation Compliance Agent.

## Two layers, one repo

```
+-----------------------------------------------------------+
|  Layer B  — AI / SDET Tooling (Python, Typer)             |
|     tools/cli.py  →  setup_doctor | failure_analyzer |    |
|                       karate_scaffold                     |
|     Offline by default. Optional LLM (OpenAI / Anthropic  |
|     / local OpenAI-compatible). Reads target/, docs/,     |
|     writes reports/ and generated/.                       |
+----------------------------|------------------------------+
                             | runs / parses
                             v
+-----------------------------------------------------------+
|  Karate suite (Java 17, JUnit5, Maven Surefire)           |
|     features/{happy, fraud, abuse, waste, negative,       |
|                guardrails, pipeline, _demo}               |
+----------------------------|------------------------------+
                             | HTTP + JWT
                             v
+-----------------------------------------------------------+
|  Layer A — Healthcare Claims Service (Node/Express)       |
|     deterministic rules engine, in-memory store,          |
|     837-like submission, 835-like adjudication            |
+-----------------------------------------------------------+
```

## Hard invariants

- Layer A never imports Layer B and never calls an LLM.
- Layer B never imports Layer A; it talks via HTTP, files, and reports.
- Default mode is fully offline. LLM features are gated by
  `LLM_ENABLED=true`.
- Karate is the only test DSL. No Cucumber dependency. Karate's
  native JSON output is Cucumber-compatible.
- Generated `.feature` drafts go to `generated/`, never to
  `src/test/resources/features/`.

## Phase 1 — Node service core (delivered)

```
server/
├── index.js           Express app composition + lifecycle
├── auth.js            JWT helpers + Bearer middleware
├── errors.js          Error envelope + asyncHandler + global handler
├── store.js           In-memory store, seed loader, ID generator
├── routes/
│   ├── meta.js        /health, /auth/login (public)
│   ├── members.js     /api/members (CRUD)
│   ├── providers.js   /api/providers
│   ├── encounters.js  /api/encounters
│   ├── claims.js      /api/claims (DRAFT + submit/adjudication/alerts in Phase 2)
│   └── admin.js       /api/admin/reset
└── data/
    ├── seed-data.json Synthetic members/providers/encounters/claims
    ├── codes.json     Synthetic procedures + diagnoses + specialties + modifiers
    ├── bundles.json   Synthetic NCCI-style bundles (for unbundling rule)
    └── mue-limits.json Synthetic MUE caps + frequency windows
```

Key conventions established in Phase 1:

- **Public surface:** `/health`, `/auth/login`. Everything under `/api/**` requires `Authorization: Bearer <jwt>`.
- **Error envelope:** `{ "error": { "code", "message", "details" } }`. Machine-readable codes (`INVALID_REQUEST`, `INVALID_MEMBER`, `INVALID_PROVIDER`, `INVALID_ENCOUNTER`, `UNKNOWN_DIAGNOSIS`, `UNKNOWN_PROCEDURE`, `DUPLICATE_ID`, `NOT_FOUND`, `UNAUTHORIZED`, `INVALID_JSON`).
- **ID prefixes:** `MBR-`, `PRV-`, `ENC-`, `CLM-`, all 5-digit zero-padded.
- **Synthetic-only codes:** procedures `PROC-*`, diagnoses `DX-*`. No real CPT/ICD usage.
- **Synthetic NPI:** any 10-digit string is accepted; the seed uses obviously-fake `0000000001`-style values.
- **Reset semantics:** `POST /api/admin/reset` reloads from `seed-data.json`; ID cursors are restored, so subsequent test runs are deterministic.

## Phase 2 — Submission pipeline (delivered)

New modules:

```
server/
├── pipeline/
│   ├── submit.js       Orchestrator. DRAFT → SUBMITTED → VALIDATED → terminal
│   ├── validator.js    Ack999-style structural / referential validator
│   └── adjudicator.js  Synthetic 835-like response builder
├── rules/
│   ├── index.js        Empty registry; Phase 3 wires in 9 rule modules
│   └── rulesEngine.js  Iterates rules, isolates failures, returns alert drafts
└── routes/
    ├── claims.js       Adds /:id/submit, /:id/adjudication, /:id/alerts
    ├── alerts.js       GET /api/alerts (filterable, empty in Phase 2)
    └── pipeline.js     GET /api/pipeline/events
```

### Claim state machine

```
                 +-------+
                 | DRAFT |  POST /api/claims
                 +---+---+
                     |
                     | POST /api/claims/{id}/submit
                     v
        Ack999 validator
                     |
        +------------+------------+
        | REJECTED                | ACCEPTED
        v                         v
   stays DRAFT             +-----------+
   (422 + ack errors)      | SUBMITTED |  CLAIM_SUBMITTED
                           +-----+-----+
                                 v
                           +-----------+
                           | VALIDATED |  CLAIM_VALIDATED
                           +-----+-----+
                                 v
                       rulesEngine.evaluate(ctx)
                                 |
                                 v
                           adjudicator.build()
                                 |
       +-------------------------+-------------------------+
       v                         v                         v
   +------+                  +-------+                +---------+
   | PAID |                  |DENIED |                |ADJUSTED |
   +------+                  +-------+                +---------+
   no DENY/ADJUST            any alert                any alert
   recommendations           recommendedAction=DENY   recommendedAction=ADJUST
```

`SUBMITTED` and `VALIDATED` are observable in `claim.statusHistory` and via the
event log. The persisted `status` ends at one of `PAID`, `DENIED`, or
`ADJUSTED` because the pipeline is synchronous. In Phase 2 the rules registry
is empty, so every accepted submission terminates at `PAID`.

### Idempotency

A second submit on a non-DRAFT claim returns **HTTP 409**
`CLAIM_ALREADY_SUBMITTED` with the existing `adjudicationId` in `details`. No
additional adjudication record, alert, or event is created. This is the only
write idempotency guarantee in the sandbox; reset-driven test runs should
always start from DRAFT.

### Correlation id (TRN)

Every submission mints exactly one `TRN-NNNNN`. That value is:

- attached to the resulting adjudication as `trn`,
- recorded on the claim as `correlationId`,
- written into every event emitted during that submission as `correlationId`.

Tests can therefore "follow the TRN" to assert that the claim, adjudication,
and emitted events all line up.

### Synthetic adjudication math

```
billedAmount         = Σ line.billedAmount
allowedAmount        = round(billedAmount × 0.85, 2)
paidAmount           = round(allowedAmount × 0.80, 2)
patientResponsibility= allowedAmount − paidAmount
contractualWritedown = billedAmount − allowedAmount     (CO-45)
```

`DENIED` zeros the payment. `ADJUSTED` halves it (CO-97). These numbers are
synthetic and chosen for clean assertions, not for realism.

## Phase 3 — Rules engine + 9 FWA rules (delivered)

Module map:

```
server/rules/
├── _shared.js                          enums + priority tables + helpers
├── index.js                            registry (9 rules, in declared order)
├── rulesEngine.js                      evaluate(ctx) + pickWinningAction(drafts)
│
├── fraud-duplicate-claim.js            FRAUD_DUPLICATE_CLAIM        CRITICAL DENY
├── fraud-phantom-billing.js            FRAUD_PHANTOM_BILLING        CRITICAL DENY
├── fraud-invalid-provider.js           FRAUD_INVALID_PROVIDER       HIGH     DENY
│
├── abuse-upcoding.js                   ABUSE_UPCODING               HIGH     MANUAL_REVIEW
├── abuse-excessive-frequency.js        ABUSE_EXCESSIVE_FREQUENCY    MEDIUM   ADJUST
├── abuse-unbundling.js                 ABUSE_UNBUNDLING             MEDIUM   ADJUST
│
├── waste-duplicate-service.js          WASTE_DUPLICATE_SERVICE      LOW      MANUAL_REVIEW
├── waste-medically-unlikely-units.js   WASTE_MEDICALLY_UNLIKELY_UNITS MEDIUM ADJUST
└── waste-unnecessary-pattern.js        WASTE_UNNECESSARY_PATTERN    LOW      MANUAL_REVIEW
```

### Action priority model

When multiple rules fire on the same claim, the adjudicator picks a single
terminal status using a three-key tie-break (implemented in
`rules/rulesEngine.js#pickWinningAction`):

```
1. ACTION    DENY > ADJUST > MANUAL_REVIEW > APPROVE
2. SEVERITY  CRITICAL > HIGH > MEDIUM > LOW
3. CATEGORY  FRAUD > ABUSE > WASTE > SYSTEM
```

Mapping to claim terminal status:

| Winning action | Claim status | paidAmount | Reason code |
|---|---|---|---|
| DENY          | DENIED   | 0                 | CO-29 |
| ADJUST        | ADJUSTED | halved            | CO-97 |
| MANUAL_REVIEW | PAID     | unchanged         | (none) |
| APPROVE       | PAID     | unchanged         | (none) |

`MANUAL_REVIEW` does **not** change payment; the alert is the signal. This
keeps adjudication math deterministic for Karate assertions even when
MANUAL_REVIEW alerts are attached.

### SYSTEM category

A rule that throws is captured by the engine as a single
`{category: 'SYSTEM', ruleCode: 'INTERNAL_RULE_ERROR'}` alert with severity
HIGH and `recommendedAction = MANUAL_REVIEW`. It is **not** a fraud/abuse/waste
finding. Dashboards, alert counts, and Karate scenarios that report on FWA
must filter by `category in (FRAUD, ABUSE, WASTE)`. SYSTEM has the lowest
category priority so it never out-ranks a genuine FWA finding when both fire.

### Why rules don't change the pipeline contract

The rule modules return *alert drafts* only. They do not assign IDs, do not
emit events, do not touch the store. Everything observable (`alertId`,
`claimId`, `memberId`, `providerId`, `raisedAt`, `ALERT_RAISED` events) is
added by `pipeline/submit.js`. This keeps each rule a small pure function
that is trivial to unit-test or hand-explain.

## Phase 4 — Karate MVP suite (delivered)

The test layer lives entirely under `src/test/`. There is no
top-level `karate/` folder; the approved layout is the Maven
standard `src/test/resources/features/` (see
[`docs/test-strategy.md`](./test-strategy.md) for the exact tree).

### Runner

Single class — [`com.claims.runner.ClaimsKarateRunner`](../src/test/java/com/claims/runner/ClaimsKarateRunner.java) —
that uses `Runner.path("classpath:features").outputCucumberJson(true).parallel(1)`.

Why single-threaded:

- All scenarios share one Node store and call `/api/admin/reset` in
  their `Background` to keep cross-claim history isolated. Parallel
  scenarios would race that reset.
- The `parallel(...)` form (vs `@Karate.Test`) is also what produces
  the aggregate `karate-summary.html` and Cucumber-compatible JSON,
  which the Phase-7 Failure Analyzer agent will consume.

Surefire is configured with `<include>**/*Runner.java</include>`
because the class is named `ClaimsKarateRunner`, not `*Test.java`.

### Auth and isolation glue

`karate-config.js` does a one-shot `karate.callSingle(...)` against
`features/_common/auth.feature`, exposes a ready-to-use
`config.headers = { Authorization: 'Bearer …' }`, and every
non-callable feature opens with:

```gherkin
Background:
  * call read('classpath:features/_common/reset.feature')
  * configure headers = headers
```

### `@db` JDBC helper

`com.claims.db.H2ClaimMirror` is a tiny embedded-H2 helper used by
`features/pipeline/db_assertion.feature`. It mirrors API
adjudications into a `claim_mirror` table and runs SQL queries that
Karate asserts on. Design note: this is the same
plumbing you would use to assert against a real Postgres warehouse if the
pipeline persisted there.

## Phase 6 — Docker + packaging (delivered)

- **`server/Dockerfile`** — production-style Node 22 Alpine image; non-root
  user; built-in `HEALTHCHECK` on `/health`.
- **`docker-compose.yml`** — single service `claims-server` publishing
  `3000:3000`. From the host, Karate keeps using
  `http://localhost:3000`; the `claims-server` hostname is reserved for
  a future all-in-container workflow (`karate.env=docker` in
  `karate-config.js`).
- **`scripts/verify.ps1` / `scripts/verify.sh`** — optional one-shot:
  `docker compose up`, wait for health, `mvnw test`, `docker compose down`.

## Decisions deferred to later phases

- Future: `MOD-59` distinct-procedural-service exception for `ABUSE_UNBUNDLING`.
- Future: Karate runner as its own Compose service (full in-container CI).

## Out of scope (intentionally simplified)

- Real X12 parsing.
- Real CPT / ICD-10 codes — synthetic placeholders only.
- Kafka, Oracle, Kubernetes, Helm, Dynatrace.
- Playwright UI tests (future extension; see `docs/ai-sdet-tooling.md`).
- LLM-driven claim adjudication (deliberately disallowed).
