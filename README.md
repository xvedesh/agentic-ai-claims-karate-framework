# Healthcare Claims Analytics Sandbox

## Short description

An **experimental, educational** sandbox for **healthcare claims analytics API automation**: synthetic members, providers, encounters, and 837-like JSON flow through a **deterministic Node/Express** API with a **nine-rule fraud / abuse / waste (FWA)** engine. **[Karate](https://github.com/karatelabs/karate)** drives REST contract tests end-to-end; a small **Python CLI** (Setup Doctor, Failure Analyzer, Karate Scaffold Generator) supports setup checks, **controlled failure-analysis** workflows, fix proposals, and test scaffolding—without replacing business logic or adjudication.

This repository is useful for **learning**, **experimentation**, **framework design**, and **QA/SDET automation** patterns. It is **not** a production claims system.

## Key features

| Area | What you get |
|------|----------------|
| **Claims analytics shape** | Intake, validation, adjudication, alerts—documented in `docs/data-flow.md` and `docs/business-rules.md`. |
| **Karate API automation** | Gherkin features under `src/test/resources/features/`, single Maven runner (`ClaimsKarateRunner`). |
| **Deterministic FWA rules** | Nine catalogued rules in `server/rules/`; outcomes are reproducible (no LLM in the money path). |
| **Pipeline & JDBC demo** | `db_assertion.feature` + `H2ClaimMirror` illustrate SQL-level assertions against mirrored adjudication data. |
| **Python AI/SDET layer** | `python -m tools.cli` — doctor, smoke run, analyze, propose-fix, scaffold (`docs/ai-sdet-tooling.md`). |
| **Docker packaging** | `docker-compose.yml` + `server/Dockerfile` for a one-command API stack; verify scripts run Karate against it. |

## Architecture overview

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

**Layer A** owns business rules and payment outcomes. **Layer B** reads build artifacts and docs; it never imports server code and never auto-applies patches.

## Tech stack

| Layer | Technology |
|-------|------------|
| API | Node 20+, Express |
| Rules engine | JavaScript modules under `server/rules/` |
| Contract | OpenAPI 0.4.0 — `docs/openapi/claims-api.yaml` |
| API tests | Java 17+, Maven, Karate |
| Tooling | Python 3.10+, pytest (`tools/tests`) |
| CI | GitHub Actions — Node API + `./mvnw test` + pytest |

## Prerequisites

- **Java 17+** (`pom.xml` targets `-source 17`; newer JDKs are fine).
- **Node 20+** for local `npm start`, **or** **Docker** for `docker compose`.
- **Python 3.10+** only if you use Layer B (`pip install -e ./tools`).
- **Maven wrapper** is included (`mvnw` / `mvnw.cmd`).

## Quick start (API on the host)

```powershell
# Terminal 1 — API
cd server; npm install; npm start

# Terminal 2 — Karate (repository root)
.\mvnw.cmd clean test
```

On macOS / Linux:

```bash
cd server && npm install && npm start
# second terminal, repo root:
./mvnw clean test
```

Open the aggregate report: `target/karate-reports/karate-summary.html` (path as appropriate for your OS).

**Expected:** **26 / 26** scenarios green on the default profile in a few seconds.

## Running with Docker

Requires a running Docker engine (e.g. Docker Desktop on Windows).

```powershell
docker compose up -d --build
.\mvnw.cmd test
docker compose down
```

One-shot verification (starts stack, waits for `/health`, runs tests, tears down unless `-KeepDocker`):

```powershell
.\scripts\verify.ps1
```

If the API is already on `localhost:3000`:

```powershell
.\scripts\verify.ps1 -SkipDocker
```

macOS / Linux:

```bash
chmod +x scripts/verify.sh   # first time only
./scripts/verify.sh
SKIP_DOCKER=1 ./scripts/verify.sh   # API already running
```

## Running Karate tests

```powershell
.\mvnw.cmd test
.\mvnw.cmd test "-Dkarate.options=--tags @smoke"
.\mvnw.cmd test "-Dkarate.options=--tags @fraud"
.\mvnw.cmd test "-Dkarate.options=--tags @db"
```

Tag taxonomy and layout: [`docs/test-strategy.md`](docs/test-strategy.md).

## Running Python AI/SDET tooling

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -e .\tools

python -m tools.cli doctor
python -m tools.cli run-smoke
python -m tools.cli analyze
python -m tools.cli propose-fix
python -m pytest tools\tests -q
```

Contract and safety rails: [`docs/ai-sdet-tooling.md`](docs/ai-sdet-tooling.md).

## Failure Analyzer demo (controlled failure workflow)

Intentional failures under `_demo/` are tagged for **Failure Analyzer** demonstrations. They are excluded from the default green profile.

1. Ensure the API is healthy (`GET /health` → 200).
2. Run: `.\mvnw.cmd test "-Dkarate.options=--tags @demo-failure"` — expect ≥ 2 failures **by design**.
3. Run: `python -m tools.cli analyze` — outputs under `reports/` (`ai-failure-analysis.{md,json,html}`); look for category **`INTENTIONAL_DEMO`**.
4. Optionally: `python -m tools.cli propose-fix` — advisory proposals only; **never auto-applied**.

Runtime outputs under `reports/` and `generated/` are **gitignored** (tracked placeholders: `.gitkeep`).

## Karate Scaffold Generator usage

Draft features are emitted only under `generated/` (never directly into `src/test/resources/features/`).

```powershell
python -m tools.cli scaffold from-openapi --tag claims
python -m tools.cli scaffold from-rule --rule FRAUD_DUPLICATE_CLAIM
python -m tools.cli scaffold suggest
```

Promote worthwhile drafts manually into the canonical feature tree. Details: [`docs/ai-sdet-tooling.md`](docs/ai-sdet-tooling.md).

## Project structure

| Path | Role |
|------|------|
| `server/` | Express API, pipeline, rules, synthetic seed data |
| `src/test/resources/features/` | Karate features by domain (`fraud/`, `abuse/`, `waste/`, `pipeline/`, …) |
| `src/test/java/` | Karate runner, JDBC helper (`H2ClaimMirror`) |
| `tools/` | Python CLI agents and unit tests |
| `docs/` | Architecture, rules, OpenAPI, guides |
| `scripts/` | `verify.ps1` / `verify.sh` for Docker + full suite |
| `.github/workflows/` | CI workflow |

## Documentation map

| Doc | Purpose |
|-----|---------|
| [`docs/architecture.md`](docs/architecture.md) | Two layers, Docker, hard invariants |
| [`docs/data-flow.md`](docs/data-flow.md) | Sandbox pipeline |
| [`docs/business-rules.md`](docs/business-rules.md) | Nine FWA rules |
| [`docs/test-strategy.md`](docs/test-strategy.md) | Karate layout, tags, runner |
| [`docs/ai-sdet-tooling.md`](docs/ai-sdet-tooling.md) | Python CLI contract |
| [`docs/demo-guide.md`](docs/demo-guide.md) | Project walkthrough and demo commands |
| [`docs/agent-workflow.md`](docs/agent-workflow.md) | Phase gates + builder agent DAG |
| [`docs/knowledge-sync-matrix.md`](docs/knowledge-sync-matrix.md) | Doc drift / sync rules |
| [`docs/project-summary.md`](docs/project-summary.md) | One-page project overview |
| [`docs/openapi/claims-api.yaml`](docs/openapi/claims-api.yaml) | API source of truth (v0.4.0) |
| [`AGENTS.md`](AGENTS.md) | Agent roster (builder vs runtime tooling) |

## Safety / synthetic data notice

**Synthetic data only.** No PHI. Labels like “837-like” and “835-like” refer to simplified JSON shapes, not a full X12 implementation. Do not use this project for real member or claim data.

## Verification checklist

1. `python -m tools.cli doctor` — workstation + `/health` (if API up).
2. `.\scripts\verify.ps1` or `SKIP_DOCKER=1 ./scripts/verify.sh` — **26 / 26** green.
3. `python -m pytest tools\tests -q` — **14 / 14** tooling unit tests.

## CI

On push/PR to `main` or `master`, [`.github/workflows/ci.yml`](.github/workflows/ci.yml) starts the API with Node, waits for `/health`, runs `./mvnw test`, then `pytest tools/tests`. **Docker is not required in CI** (host-run Karate against `localhost:3000`).

## Project highlights (design decisions)

- **Karate-only API layer** — Cucumber-compatible JSON without a second test runner for HTTP.
- **Deterministic adjudication** — LLMs never drive payment outcomes; tooling is adjacent.
- **Generated tests in `generated/`** — human promotion into `src/test/`.
- **`@intentional-failure` excluded by default** — green default profile; controlled demos are opt-in.
- **Provider-agnostic LLM adapter** — env-gated; offline is the default.

## License

Educational and experimental sandbox project. Use for learning and experimentation at your own discretion; there is no warranty.
