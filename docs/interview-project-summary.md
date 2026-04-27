# Interview project summary (release-ready)

One page you can skim **before** a loop or send as a **pre-read** link.
Synthetic data only; no PHI; not production X12.

## Elevator line (15 seconds)

Deterministic **Node/Express** API simulates claim intake, validation, nine
**fraud / abuse / waste** rules, and 835-like adjudication. **Karate**
locks the contract (26 scenarios on the default profile). A small **Python
CLI** helps with setup checks, failure triage, and draft test scaffolding —
**offline by default**; LLMs never adjudicate claims.

## What to open on screen

| Artifact | Path |
|----------|------|
| API contract | `docs/openapi/claims-api.yaml` (v0.4.0) |
| Rule catalog | `docs/business-rules.md` |
| Karate features | `src/test/resources/features/` |
| Aggregate test report | `target/karate-reports/karate-summary.html` (after `mvnw test`) |
| Demo script (timed) | `docs/interview-demo-guide.md` |

## Numbers that matter

| Metric | Value |
|--------|------|
| Default Karate scenarios | **26 / 26** green |
| FWA rule codes (catalog) | **9** |
| Python tooling unit tests | **14** (`python -m pytest tools/tests -q`) |
| OpenAPI version | **0.4.0** |

## Commands (copy-paste)

**API (host):** `cd server && npm ci && npm start`  
**Tests:** `./mvnw test` (Windows: `.\mvnw.cmd test`)  
**Docker stack + tests:** `.\scripts\verify.ps1` or `./scripts/verify.sh`  
**SDET CLI:** `python -m tools.cli doctor` → `run-smoke` → `analyze` → `propose-fix` → `scaffold …`

## Outputs that must never be committed

| Location | Contents |
|----------|----------|
| `reports/**` | Doctor, analyzer, fix proposals, patches (ignored; keep `reports/.gitkeep`) |
| `generated/**` | Scaffolded `.feature` drafts (ignored; keep `generated/.gitkeep` placeholders) |
| `target/**` | Maven + Karate HTML/JSON (ignored) |

## Boundaries you can state clearly

- **Layer A** — business rules and money paths; no Python import, no LLM.
- **Layer B** — reads `target/`, `docs/`, optional logs; writes `reports/` and
  `generated/`; never writes into `src/test/resources/features/` without a
  human.
- **CI / verify** — host-run Karate against `http://localhost:3000`; Docker
  ships **API only** for v1 (no Java-in-container).

## Phase plan (original 0–11 vs today)

The approved compression (original phases **5–8** → current **Phase 5**;
**9–11** → current **Phase 6**) is documented in
[`docs/agent-workflow.md`](./agent-workflow.md) (*Original plan reconciliation*).

## Continuous integration

GitHub Actions workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):
Ubuntu, Java 17, Node 22, API via `node index.js`, `./mvnw test`, then
`pytest tools/tests`. **Docker is not required in CI** (matches the
API-only Compose decision for v1). Triggers on `main` and `master`; edit
the workflow if your default branch uses another name.

## If they ask “what would you do next?”

- Contract diff between OpenAPI snapshots on PR.
- More `scaffold from-rule` templates (only two curated examples today).
- Warehouse persistence behind the same Karate contracts (replace H2 demo
  with Postgres testcontainer when scope allows).
