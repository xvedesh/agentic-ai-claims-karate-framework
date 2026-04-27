# Healthcare Claims Analytics Sandbox

Lightweight **healthcare claims analytics** sandbox: synthetic members,
providers, encounters, and 837-like JSON claims run through a deterministic
Node API with a **nine-rule fraud / abuse / waste** engine. **Karate**
exercises the REST contract end-to-end; a small **Python CLI** (Setup Doctor,
Failure Analyzer, Karate Scaffold Generator) accelerates SDET workflows
without replacing business logic.

> **Synthetic data only.** No PHI. “837-like” and “835-like” are labels for
> simplified JSON — not a real X12 stack.

## What you can say in the first 60 seconds

| Pillar | Where it lives |
|--------|----------------|
| Healthcare claims analytics sandbox | `server/`, `docs/data-flow.md`, `docs/business-rules.md` |
| Karate API automation | `src/test/resources/features/`, `ClaimsKarateRunner` |
| Fraud / abuse / waste validation | `server/rules/`, tagged `@fraud` / `@abuse` / `@waste` |
| H2 / JDBC assertion demo | `src/test/resources/features/pipeline/db_assertion.feature`, `com.claims.db.H2ClaimMirror` |
| AI / SDET tooling layer | `python -m tools.cli`, `docs/ai-sdet-tooling.md` |

Full architecture: [`docs/architecture.md`](docs/architecture.md).

## Architecture at a glance

```
Layer B (Python, optional LLM)  tools/cli.py
   ├── setup_doctor   doctor | run-smoke | explain
   ├── failure_analyzer  analyze | propose-fix
   └── karate_scaffold  from-openapi | from-rule | suggest
                |
                ▼  parses target/, generated/, reports/
Karate suite   src/test/resources/features/{happy,fraud,abuse,waste,
   (Java 17+)                    negative,guardrails,pipeline,_demo}
                |
                ▼  HTTP + JWT
Layer A         server/  (Node/Express, deterministic rules engine)
```

## Status

**Phase 6 — packaging and interview-readiness.** Layer A ships with a
**Dockerfile** and **`docker-compose.yml`** for a one-command API stack.
**`scripts/verify.ps1`** / **`scripts/verify.sh`** run the full Karate suite
against that API. Phase 5 Python tooling remains the SDET cockpit; see
[`docs/interview-demo-guide.md`](docs/interview-demo-guide.md) for a timed
walkthrough.

## Prerequisites

- **Java 17+** (`pom.xml` uses `-source 17`; JDK 18+ is fine).
- **Node 20+** for local `npm start`, **or** **Docker Desktop** (or any Docker
  engine) for `docker compose`.
- **Python 3.10+** only if you use Layer B (`pip install -e ./tools`).
- **Maven wrapper** is bundled (`mvnw` / `mvnw.cmd`).

## Quick start (API on the host)

```powershell
# Terminal 1 — API
cd server; npm install; npm start

# Terminal 2 — Karate (run from repository root, i.e. parent of server/)
# PowerShell:
.\mvnw.cmd clean test
# bash (macOS / Linux):
#   ./mvnw clean test

# Aggregate report
start .\target\karate-reports\karate-summary.html
```

Expected: **26 / 26** scenarios green in a few seconds.

## Quick start (API in Docker)

Requires Docker daemon running (e.g. Docker Desktop on Windows).

```powershell
docker compose up -d --build
.\mvnw.cmd test   # or: ./mvnw test
docker compose down
```

One-shot verification (starts stack, waits for `/health`, runs tests, stops
stack unless `-KeepDocker`):

```powershell
.\scripts\verify.ps1
```

Skip Docker when the API is already on `localhost:3000`:

```powershell
.\scripts\verify.ps1 -SkipDocker
```

macOS / Linux:

```bash
chmod +x scripts/verify.sh   # first time only
./scripts/verify.sh
SKIP_DOCKER=1 ./scripts/verify.sh   # API already running
```

## Common Karate commands

```powershell
.\mvnw.cmd test "-Dkarate.options=--tags @smoke"
.\mvnw.cmd test "-Dkarate.options=--tags @fraud"
.\mvnw.cmd test "-Dkarate.options=--tags @db"
.\mvnw.cmd test "-Dkarate.options=--tags @demo-failure"
```

Tag taxonomy: [`docs/test-strategy.md`](docs/test-strategy.md).

## AI / SDET tooling (Phase 5)

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -e .\tools

python -m tools.cli doctor
python -m tools.cli run-smoke
python -m tools.cli analyze
python -m tools.cli propose-fix
python -m tools.cli scaffold from-openapi --tag claims
python -m pytest tools\tests -q
```

Contract and safety rails: [`docs/ai-sdet-tooling.md`](docs/ai-sdet-tooling.md).

## Final verification (copy-paste checklist)

1. `python -m tools.cli doctor` — workstation + `/health` (if API up).
2. `.\scripts\verify.ps1` **or** `SKIP_DOCKER=1 ./scripts/verify.sh` — **26 / 26** green.
3. `python -m pytest tools\tests -q` — **14 / 14** tooling unit tests.
4. (Optional demo) `.\mvnw.cmd test "-Dkarate.options=--tags @demo-failure"` then
   `python -m tools.cli analyze` — failures tagged **`INTENTIONAL_DEMO`**.

Runtime outputs under `reports/` and `generated/` are **gitignored** (only
`.gitkeep` placeholders are tracked).

**CI:** On push/PR to `main` or `master`, [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
starts the API with Node, waits for `/health`, runs `./mvnw test`, then runs
`pytest tools/tests`. No Docker-in-CI requirement.

## Sanity-checking the API by hand

```powershell
$base = "http://localhost:3000"
Invoke-RestMethod "$base/health"
$tok = (Invoke-RestMethod "$base/auth/login" -Method POST -ContentType application/json `
        -Body '{"username":"user1","password":"password1"}').accessToken
$h = @{ Authorization = "Bearer $tok"; "Content-Type" = "application/json" }
Invoke-RestMethod "$base/api/members"   -Headers $h
Invoke-RestMethod "$base/api/providers" -Headers $h
```

## Documentation map

| Doc | Purpose |
|-----|---------|
| [`docs/architecture.md`](docs/architecture.md) | Two layers, Docker, hard invariants |
| [`docs/data-flow.md`](docs/data-flow.md) | Sandbox pipeline |
| [`docs/business-rules.md`](docs/business-rules.md) | Nine FWA rules |
| [`docs/test-strategy.md`](docs/test-strategy.md) | Karate layout, tags, runner |
| [`docs/ai-sdet-tooling.md`](docs/ai-sdet-tooling.md) | Python CLI contract |
| [`docs/interview-demo-guide.md`](docs/interview-demo-guide.md) | **5–10 min demo script** |
| [`docs/agent-workflow.md`](docs/agent-workflow.md) | Phase gates + agent DAG |
| [`docs/knowledge-sync-matrix.md`](docs/knowledge-sync-matrix.md) | Doc drift rules |
| [`docs/openapi/claims-api.yaml`](docs/openapi/claims-api.yaml) | API source of truth (v0.4.0) |
| [`AGENTS.md`](AGENTS.md) | Agent roster |
| [`docs/interview-project-summary.md`](docs/interview-project-summary.md) | One-page release / interview summary |

## Decisions you can defend in an interview

- **Karate-only API layer** — Cucumber-compatible JSON without a second runner.
- **Deterministic adjudication** — LLMs never drive payment outcomes; tooling is adjacent.
- **Generated tests in `generated/`** — human promotion into `src/test/`.
- **`@intentional-failure` excluded by default** — green default profile; demos are explicit.
- **Provider-agnostic LLM adapter** — env-gated; offline is the default.

## License

For demo / interview use.
