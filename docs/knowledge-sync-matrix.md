# Knowledge Sync Matrix (Phase 0 skeleton)

> Status: maintained. Owner: Documentation Compliance Agent.
>
> This is the enforcement source for the Documentation Compliance Agent.
> Every PR that changes a row's *Code area* must also update the row's
> *Required doc(s)* in the same change set, or be rejected.

| Code area | Required doc(s) | Owner |
|---|---|---|
| `server/routes/**` (new or renamed endpoints) | `docs/openapi/claims-api.yaml`, `docs/architecture.md` | Backend Engineer |
| `server/rules/**` (rule added/changed) | `docs/business-rules.md`, `docs/test-strategy.md` (tag list) | Rules Engine + Karate SDET |
| `server/data/seed-data.json` (synthetic data shape) | `docs/data-flow.md` | Healthcare Domain Analyst |
| `server/pipeline/**` | `docs/data-flow.md`, `docs/architecture.md` | Backend Engineer |
| `src/test/resources/features/**` (new tag) | `docs/test-strategy.md` (tag taxonomy) | Karate SDET |
| `src/test/resources/features/**` (new feature file) | `docs/test-strategy.md` (Delivered scenario count + Folder layout) | Karate SDET |
| `src/test/java/com/claims/runner/**` (runner shape change) | `docs/test-strategy.md` (Why `Runner.path(...).parallel(1)`) | Karate SDET |
| `src/test/java/com/claims/db/**` (new JDBC helper) | `docs/test-strategy.md` (`@db` row), `docs/architecture.md` | Karate SDET |
| `tools/agents/**` (new sub-command, new agent) | `docs/ai-sdet-tooling.md`, `tools/README.md`, `docs/demo-guide.md` | Documentation Compliance |
| `tools/agents/failure_analyzer.py` (categoriser change) | `docs/ai-sdet-tooling.md` (category table) + `tools/tests/test_failure_analyzer.py` | Documentation Compliance |
| `tools/agents/karate_scaffold.py` (template change) | `docs/ai-sdet-tooling.md`, `tools/tests/test_karate_scaffold.py` | Documentation Compliance |
| `tools/cli.py` (new command flag) | `docs/ai-sdet-tooling.md` (Three tools section) + `README.md` (AI/SDET tooling section) | Documentation Compliance |
| `tools/agents/_common/llm.py` (provider added) | `docs/ai-sdet-tooling.md` (env contract) | Documentation Compliance |
| `pom.xml` (dependency change) | `docs/test-strategy.md` (Stack section) | Karate SDET |
| `docker-compose.yml`, `server/Dockerfile` | `README.md` (Docker / verify), `docs/architecture.md` (Phase 6), `docs/demo-guide.md` | Backend Engineer |
| `scripts/verify.ps1`, `scripts/verify.sh` | `README.md` (Final verification), `docs/demo-guide.md` | Verification / Review |
| `.gitignore` (`reports/`, `generated/`, `target/`) | `README.md` (note on ignored artifacts) | Documentation Compliance |
| `.github/workflows/ci.yml` | `README.md` (optional: mention CI), `docs/project-summary.md` | Verification / Review |
| `docs/agent-workflow.md` (phase reconciliation / gates) | `docs/project-summary.md` (optional cross-link) | Documentation Compliance |
| `.cursor/rules/**` | `AGENTS.md` (specialist index) | Documentation Compliance |

## Enforcement

The matrix is checked by hand at each phase checkpoint. A future
extension may add a CI script (`tools/agents/_common/sync_check.py`)
that compares git diff against this table and fails the build on
drift; this is intentionally not part of v1.
