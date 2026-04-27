# Claude Code — repository guide

Use **[`AGENTS.md`](AGENTS.md)** as the **provider-neutral** contract for how work is organized here: builder-time agent roles, runtime SDET tooling (`tools/`), phase gates, and the docs-sync matrix.

## Architecture (do not blur these layers)

- **Layer A** — `server/`: Node/Express API, deterministic fraud/abuse/waste rules, synthetic data. No Python from the server; no LLM in adjudication paths.
- **Layer B** — `tools/`: Python CLI (`python -m tools.cli`). Reads `target/`, `docs/`, optional logs; writes `reports/` and `generated/`. **Never** writes into `src/test/resources/features/` except via human promotion; **never** auto-applies fix proposals.

## Commands that matter

| Goal | Command |
|------|---------|
| API (host) | `cd server && npm install && npm start` |
| Karate (API on `localhost:3000`) | `.\mvnw.cmd test` (Windows) / `./mvnw test` |
| API in Docker + tests | `.\scripts\verify.ps1` or `./scripts/verify.sh` |
| Python tooling | `pip install -e ./tools` then `python -m tools.cli doctor` / `analyze` / … |
| Tooling unit tests | `python -m pytest tools/tests -q` |

Default Karate profile excludes `@intentional-failure` demos. Scenario counts appear in **`target/karate-reports/karate-summary.html`** (Maven may report **1** JUnit test because of a single `ClaimsKarateRunner`).

## Key paths

| Path | Purpose |
|------|---------|
| `docs/openapi/claims-api.yaml` | API contract (source of truth) |
| `docs/business-rules.md` | Rule catalog |
| `docs/ai-sdet-tooling.md` | Layer B contract |
| `src/test/resources/features/` | Canonical Karate features |
| `generated/` | Scaffold output only (gitignored except placeholders) |

## What to avoid changing without explicit scope

- Rules semantics and priority in `server/rules/` unless paired with `docs/business-rules.md` and Karate coverage.
- `pom.xml` Karate tag defaults and runner shape without updating `docs/test-strategy.md`.
- CI workflow and verify scripts unless the user asks for packaging/CI work.

When in doubt on docs ownership, see **`docs/knowledge-sync-matrix.md`**.
