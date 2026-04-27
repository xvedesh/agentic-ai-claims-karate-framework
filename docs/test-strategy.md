# Test Strategy

> Status: Phase 4 — MVP Karate suite delivered (26/26 green).
> Owner: Karate SDET Agent.

## Stack

- **Karate 1.5.0 DSL** (JUnit5 runner)
- **Maven Surefire 3.2.5** (`<include>**/*Runner.java</include>` so the
  Karate runner is picked up alongside `*Test.java` defaults)
- **Java 17+** (build verified on 17 and 18)
- **H2 2.2.224** (`scope=test`) — used by the single `@db` JDBC scenario
- Reports: `target/karate-reports/karate-summary.html` plus
  Cucumber-compatible JSON at `target/karate-reports/karate-summary-json.txt`
- Single runner: [`com.claims.runner.ClaimsKarateRunner`](../src/test/java/com/claims/runner/ClaimsKarateRunner.java)

## Why `Runner.path(...).parallel(1)` instead of `@Karate.Test`

Two reasons:

1. Every scenario calls `/api/admin/reset` in its `Background` to keep
   cross-claim history isolated (Phase 4 constraint from the brief).
   Parallel scenarios would race that reset and corrupt each other's
   state. We trade throughput for determinism.
2. The `Runner.path(...).parallel(...)` form produces the aggregate
   `karate-summary.html` and Cucumber-compatible JSON;
   the `@Karate.Test` annotation does not.

The **Phase-5 Failure Analyzer agent**
(`python -m tools.cli analyze`) consumes exactly these reports: it
reads every `target/karate-reports/features.*.json` for per-scenario
failure context and `karate-summary-json.txt` for the totals row.
Generated drafts from `scaffold from-openapi` carry the
`@scaffold @generated` tag pair so they can be triaged in isolation
before being copied into `src/test/resources/features/`.

## Tag taxonomy (locked at end of Phase 4)

| Tag | Purpose | Default profile? |
|---|---|---|
| `@smoke` | Minimal lifecycle pass; called by Setup Doctor `run-smoke`. | yes |
| `@happy` | End-to-end happy-path scenarios. | yes |
| `@fraud` | Fraud-rule scenarios (3 rules). | yes |
| `@abuse` | Abuse-rule scenarios (3 rules). | yes |
| `@waste` | Waste-rule scenarios (3 rules). | yes |
| `@guardrail` | False-positive guardrail tests (must NOT alert). | yes |
| `@negative` | 4xx contract / error-envelope scenarios. | yes |
| `@pipeline` | Event-log / TRN-correlation scenarios. | yes |
| `@db` | The single H2/JDBC mirror-and-assert scenario. | yes |
| `@regression` | Aggregator — every rule scenario plus the contract suite. | yes |
| `@intentional-failure` | Intentionally failing demo features. | **excluded** |
| `@demo-failure` | Same scenarios under a friendlier alias for live demos. | excluded (via `@intentional-failure`) |

Default Surefire profile (set in `pom.xml`):
`-Dkarate.options="--tags ~@intentional-failure"`.

## Folder layout (matches AGENTS.md and `karate-config.js`)

```
src/test/resources/features/
  _common/   <-- callable features only, all tagged @ignore
    auth.feature          (called once via karate.callSingle in karate-config.js)
    reset.feature         (called from every scenario's Background)
    helpers.feature       (createEncounter / createClaim / submitClaim / getClaimAlerts)
  _demo/
    demo_assertion_drift.feature   @intentional-failure @demo-failure
  happy/
    claim_lifecycle.feature        @happy @smoke @regression
  fraud/
    duplicate_claim.feature        @fraud @regression
    phantom_billing.feature        @fraud @regression
    invalid_provider.feature       @fraud @regression
  abuse/
    upcoding.feature               @abuse @regression
    excessive_frequency.feature    @abuse @regression
    unbundling.feature             @abuse @regression
  waste/
    duplicate_service.feature      @waste @regression
    medically_unlikely_units.feature @waste @regression
    unnecessary_pattern.feature    @waste @regression
  guardrails/
    legitimate_claims.feature      @guardrail @regression  (6 scenarios in one file)
  negative/
    contract_violations.feature    @negative @regression  (6 scenarios in one file)
  pipeline/
    events.feature                 @pipeline @regression  (2 scenarios)
    db_assertion.feature           @db @pipeline @regression
```

## Delivered scenario count (Phase 4 MVP)

| Category | Scenarios | Notes |
|---|---:|---|
| `@happy` / `@smoke` | 1 | Full DRAFT → PAID lifecycle. |
| `@fraud` (3 rules) | 4 | invalid_provider has 2 scenarios (inactive + specialty mismatch). |
| `@abuse` (3 rules) | 3 | One scenario per rule. |
| `@waste` (3 rules) | 3 | One scenario per rule. |
| `@guardrail` | 6 | One per non-trivial rule (R2 reuses the happy path). |
| `@negative` | 6 | auth missing, bad token, 404, 400 unknown procedure, 400 bad date, 409 idempotency. |
| `@pipeline` | 2 | Happy-path event chain + denied-claim ALERT_RAISED chain. |
| `@db` | 1 | Mirror an adjudication into H2 and assert via SELECT. |
| `@intentional-failure` `@demo-failure` | 2 | ASSERTION_DRIFT + STALE_BASELINE failures, **excluded by default**. |
| **Total green (default profile)** | **26** | 14 features. |
| **Total intentional fails (`--tags @demo-failure`)** | **2** | For the Failure Analyzer demo. |

Every one of the 9 catalogued FWA rule codes
(`FRAUD_DUPLICATE_CLAIM`, `FRAUD_PHANTOM_BILLING`, `FRAUD_INVALID_PROVIDER`,
`ABUSE_UPCODING`, `ABUSE_EXCESSIVE_FREQUENCY`, `ABUSE_UNBUNDLING`,
`WASTE_DUPLICATE_SERVICE`, `WASTE_MEDICALLY_UNLIKELY_UNITS`,
`WASTE_UNNECESSARY_PATTERN`) appears in at least one `@regression`
scenario, satisfying the Karate SDET Agent's verification obligation
(`AGENTS.md` §2).

## MANUAL_REVIEW assertion shape (Phase 4 brief)

For the three rules whose `recommendedAction = MANUAL_REVIEW`
(`ABUSE_UPCODING`, `WASTE_DUPLICATE_SERVICE`, `WASTE_UNNECESSARY_PATTERN`)
each scenario asserts **all three** of the following on the same
adjudication:

```gherkin
And match adj.status == 'PAID'                    # claim still pays
And match adj.winningAction == 'MANUAL_REVIEW'    # but flagged for review
# ... and the alert in /alerts has:
#   recommendedAction: 'MANUAL_REVIEW'
```

This documents to a reviewer that MANUAL_REVIEW alerts attach to a paid
claim — payment is unchanged, but the alert surface still flags it for
human review. (Real-world payers would route these to a clinical
review queue.)

## Test isolation pattern

Every non-callable feature opens with:

```gherkin
Background:
  * call read('classpath:features/_common/reset.feature')
  * configure headers = headers
```

`reset.feature` calls `POST /api/admin/reset`, which restores the
seeded fixtures (members, providers, encounters, `CLM-00050..00053`)
and the deterministic `_idCursors`. The `headers` value is set once
per JVM by `karate-config.js` via `karate.callSingle(...)` against
`_common/auth.feature`.

## Reports

```powershell
start .\target\karate-reports\karate-summary.html
```

Cucumber-compatible JSON for CI ingest:
`target/karate-reports/karate-summary-json.txt`
plus per-feature `target/karate-reports/features.<package>.json`.

## How to run

```powershell
# 1. Start the Node service in another shell
cd server; npm install; npm start

# 2. Default regression run (excludes @intentional-failure)
.\mvnw.cmd test

# 3. Smoke only
.\mvnw.cmd test "-Dkarate.options=--tags @smoke"

# 4. Just the H2/JDBC scenario
.\mvnw.cmd test "-Dkarate.options=--tags @db"

# 5. Run the intentional failures (for the Failure Analyzer demo)
.\mvnw.cmd test "-Dkarate.options=--tags @demo-failure"

# 6. Slice by category
.\mvnw.cmd test "-Dkarate.options=--tags @fraud"
.\mvnw.cmd test "-Dkarate.options=--tags @abuse or @waste"
```
