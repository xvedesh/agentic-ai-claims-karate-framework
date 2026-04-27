# Interview Demo Guide (Phase 6 — delivered)

> Owner: Documentation Compliance Agent.  
> One-page facts + numbers: [`interview-project-summary.md`](./interview-project-summary.md).  
> Goal: a **5–10 minute** walkthrough you can narrate without slides, showing
> a healthcare claims analytics sandbox, Karate API automation, FWA rules,
> one JDBC assertion, and AI-augmented SDET tooling — **without** implying
> that an LLM adjudicates claims.

## The 5-minute pitch (memorise this block)

1. **Healthcare claims analytics sandbox** — Synthetic members, providers,
   encounters, and 837-like JSON claims flow through a deterministic Node API.
   Submission produces Ack999-style validation, 835-like adjudication, and
   persisted alerts when fraud / abuse / waste rules fire.
2. **Karate API automation** — One Maven runner (`ClaimsKarateRunner`) drives
   Gherkin-readable features under `src/test/resources/features/`. Default
   profile is **26 / 26 green**; aggregate HTML lives in
   `target/karate-reports/karate-summary.html`.
3. **Fraud / abuse / waste** — Nine catalogued rules (`docs/business-rules.md`)
   with a deterministic priority model (`winningAction`). Tests assert
   terminal status, paid amounts, and `ruleCode` where it matters.
4. **H2 / JDBC assertion demo** —
   `src/test/resources/features/pipeline/db_assertion.feature` plus
   `com.claims.db.H2ClaimMirror` show how the same adjudication outcome could
   be mirrored into a warehouse-style store for SQL-level assertions.
5. **AI / SDET tooling layer** — Python CLI (`python -m tools.cli`) for
   workstation health (`doctor`), failure triage (`analyze`, `propose-fix`),
   and draft test scaffolding (`scaffold`). **Offline by default**; LLM is
   opt-in and never touches Layer A code paths.

## Prerequisites (30 seconds before you share screen)

| Need | Why |
|---|---|
| Java 17+, repo cloned | Maven + Karate |
| Node 20+ **or** Docker Desktop running | API on port 3000 |
| Python 3.10+ venv with `pip install -e ./tools` | Layer B demo (optional but recommended) |

Quick API check: `curl -s http://localhost:3000/health` → `{"status":"UP",...}`

## Path A — API on the host (fastest for a live laptop)

```powershell
cd server
npm install
npm start
```

New terminal at repo root:

```powershell
.\mvnw.cmd clean test
start .\target\karate-reports\karate-summary.html
```

## Path B — API in Docker (shows “real” packaging)

From repo root (Docker Desktop must be running):

```powershell
docker compose up -d --build
# wait until healthy, then:
.\mvnw.cmd test
docker compose down
```

Or the bundled one-shot (starts Docker, runs full suite, tears down):

```powershell
.\scripts\verify.ps1
```

macOS / Linux:

```bash
chmod +x scripts/verify.sh   # once
./scripts/verify.sh
```

With the API already running locally:

```bash
SKIP_DOCKER=1 ./scripts/verify.sh
```

## 8-step demo flow (Layer B + intentional failures)

Run these **after** the API is healthy (`/health` = 200).

| # | Step | Command | Expected outcome |
|---|------|---------|------------------|
| 1 | Setup Doctor | `python -m tools.cli doctor` | Green checks; `reports/doctor-report.md` (gitignored) |
| 2 | Smoke slice | `python -m tools.cli run-smoke` **or** `.\mvnw.cmd test "-Dkarate.options=--tags @smoke"` | 1 scenario green |
| 3 | Full regression (optional if short on time) | `.\mvnw.cmd test` | 26 / 26 green |
| 4 | Intentional failures | `.\mvnw.cmd test "-Dkarate.options=--tags @demo-failure"` | ≥ 2 failures **by design** |
| 5 | Failure Analyzer | `python -m tools.cli analyze` | `reports/ai-failure-analysis.{md,json,html}` |
| 6 | Open HTML triage | Windows: `start .\reports\ai-failure-analysis.html` — macOS: `open reports/ai-failure-analysis.html` — Linux: `xdg-open reports/ai-failure-analysis.html` | Categories include `INTENTIONAL_DEMO` for `_demo/` features |
| 7 | Advisory fix proposals | `python -m tools.cli propose-fix` | `reports/failure-fix-proposals.md` — **never auto-applied** |
| 8 | Scaffold smoke | `python -m tools.cli scaffold from-openapi --tag claims` | Drafts under `generated/features/claims/` (`@scaffold @generated`; gitignored except `.gitkeep`) |

If you need to show **rule-aware** scaffolding without reading the whole OpenAPI tree:

```powershell
python -m tools.cli scaffold from-rule --rule FRAUD_DUPLICATE_CLAIM
python -m tools.cli scaffold suggest   # also writes reports/test-generation-plan.md (gitignored)
```

## Where to click in the Karate report (talking while you scroll)

- **Summary row** — total scenarios, pass/fail, wall time (proves the suite is
  small enough for a PR gate).
- **One fraud scenario** — show `Background` calling `_common/reset.feature`
  (test isolation) and assertions on `adjudication.winningAction`.
- **One `MANUAL_REVIEW` scenario** — point at three assertions: claim stays
  `PAID`, `adjudication.winningAction == 'MANUAL_REVIEW'`, alert
  `recommendedAction == 'MANUAL_REVIEW'`.
- **`@db` feature** — mention `Java.type('com.claims.db.H2ClaimMirror')` as the
  bridge pattern for warehouse validation.

## Talking points (sound bites)

- “Layer A is **fully deterministic** — payment outcomes never depend on an LLM.”
- “Layer B is the **SDET cockpit**: it reads the same Karate JSON CI already
  emits; I did not invent a parallel reporting format.”
- “`@intentional-failure` stays **out of the default profile** so the suite
  stays merge-green; I opt into demo failures when I want to show triage.”
- “The Failure Analyzer categorises failures **rule-first** so CI stays
  reproducible; narration from an LLM is optional and env-gated.”
- “Generated tests land only in `generated/` — **I** promote what is worth
  keeping into `src/test/resources/features/`.”

## If something breaks during the interview

| Symptom | Likely cause | Recovery |
|---------|--------------|----------|
| `ECONNREFUSED` in Karate | API not up | Path A or B above |
| `docker compose` errors | Docker daemon stopped | Start Docker Desktop; retry `docker compose up -d --build` |
| Port 3000 busy | Another process | Free the port or change host mapping in `docker-compose.yml` |
| `doctor` warns on health | Wrong base URL | Ensure `http://localhost:3000` matches `karate-config.js` |
| Analyzer shows 0 failures | Last Maven run was green | Re-run step 4 (`@demo-failure`) before `analyze` |

## Time-boxing cheat sheet

| Minutes | Do |
|--------:|-----|
| 5 | Pitch (5 bullets) + `doctor` + `run-smoke` + open `karate-summary.html` on one fraud scenario |
| 8 | Above + full `mvnw test` + `@demo-failure` + `analyze` + open `ai-failure-analysis.html` |
| 10 | Above + `propose-fix` + `scaffold from-openapi` + show one file under `generated/features/claims/` |
