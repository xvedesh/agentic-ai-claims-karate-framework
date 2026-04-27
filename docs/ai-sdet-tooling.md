# AI / SDET Tooling Layer (Phase 5 — delivered)

> Status: delivered. Owner: Documentation Compliance Agent.
> All three agents are wired through `python -m tools.cli`. They run
> fully offline by default; LLM enrichment is opt-in.

The Python tooling under `tools/` exists to accelerate the SDET
workflow, not to replace deterministic claim adjudication. This file
is the source of truth for what each tool does, how it is invoked, and
what it must never do.

## Hard contract

| Tools may | Tools must NOT |
|---|---|
| Run tests, parse reports, parse logs. | Replace the deterministic rules engine. |
| Generate draft Karate features into `generated/`. | Write directly into `src/test/resources/features/`. |
| Propose fixes (markdown + advisory diff stubs). | Apply fixes automatically. |
| Read `docs/`, `target/`, `server/data/`. | Import any code from `server/` or be imported by it. |
| Optionally call an LLM when `LLM_ENABLED=true`. | Require an LLM key for the basic demo to work. |
| Run offline. | Make network calls in default mode. |

## Three tools (single CLI tree)

```bash
python -m tools.cli doctor
python -m tools.cli run-smoke
python -m tools.cli explain <topic>
python -m tools.cli analyze
python -m tools.cli propose-fix --emit-patches
python -m tools.cli scaffold from-openapi --tag claims
python -m tools.cli scaffold from-rule --rule FRAUD_DUPLICATE_CLAIM
python -m tools.cli scaffold suggest
```

### 1. Setup Doctor (`tools/agents/setup_doctor.py`)

| Command | What it does |
|---|---|
| `doctor` | Probes Python 3.10+, Java 17+, Maven wrapper, Node 20+, npm, repo layout, port 3000 + `/health`, and LLM env. Writes `reports/doctor-report.md`. Exits non-zero on any FAIL. |
| `run-smoke` | Refuses to start unless `/health` answers, then runs `mvnw test -Dkarate.options=--tags @smoke`. |
| `explain <topic>` | Slices `docs/` and prints a curated section. Topics: `setup`, `rules`, `tags`, `reports`, `agents`, `tools`, `troubleshooting`. |

### 2. Failure Analyzer (`tools/agents/failure_analyzer.py`)

Parses `target/karate-reports/features.*.json` (Cucumber-compatible
Karate output) and the aggregate `karate-summary-json.txt`.
Categorisation is **rule-based and deterministic** (no LLM is needed
for this); the LLM is only ever used for narrative enrichment in a
later optional pass.

| Category | Trigger |
|---|---|
| `INTENTIONAL_DEMO` | feature path under `_demo/` or scenario tagged `@intentional-failure` / `@demo-failure` |
| `ENV_CONNECTIVITY` | `ECONNREFUSED`, `Connection refused`, `timed out` |
| `CONTRACT_DRIFT` | Karate "status code was: X, expecting: Y" |
| `ASSERTION_DRIFT` | `match failed: EQUALS|NOT_EQUALS|...` outside a rule folder |
| `RULE_LOGIC` | `match failed` inside `fraud/`, `abuse/`, `waste/` referencing `ruleCode` / `winningAction` / `recommendedAction` |
| `DATA_SETUP` | error envelope code in `{INVALID_REQUEST, UNKNOWN_PROCEDURE, INVALID_*}` |
| `UNCLASSIFIED` | everything else |

Sub-commands:

- `analyze` — emits
  - `reports/ai-failure-analysis.json` (machine-readable)
  - `reports/ai-failure-analysis.md` (human Markdown)
  - `reports/ai-failure-analysis.html` (lightweight static page)
- `propose-fix` — consumes the JSON report and writes
  `reports/failure-fix-proposals.md` with a per-finding action
  template. With `--emit-patches`, also writes advisory unified-diff
  stubs to `reports/patches/finding-NN.patch`. **Patches are never
  auto-applied.**

### 3. Karate Scaffold Generator (`tools/agents/karate_scaffold.py`)

Reads `docs/openapi/claims-api.yaml` (the v0.4.0 spec is the contract
source of truth) and emits drafts to `generated/features/`.

| Command | Output |
|---|---|
| `scaffold from-openapi --tag claims` | One `<method>_<path>.feature` per operation under `generated/features/<tag>/`, with positive + 401 + 404 scenarios where applicable. Path parameters get a placeholder `* def <name> = 'TODO-<NAME>'` so the draft compiles. |
| `scaffold from-rule --rule <RULE_CODE>` | Positive + guardrail scenarios anchored on the seeded `MBR-00010..00012` / `CLM-00050..00053` fixtures. |
| `scaffold suggest` | Coverage matrix between the 9 catalogued rule codes and the live Karate features. Writes `reports/test-generation-plan.md`. |

Generated drafts always carry:

```text
@scaffold @<tag> @generated
```

so the SDET can run them in isolation (`-Dkarate.options=--tags @scaffold`)
to triage failures before promoting anything into
`src/test/resources/features/`. **The agent never writes into the
canonical features folder.**

## LLM configuration (provider-agnostic, opt-in)

```bash
LLM_ENABLED=true
LLM_PROVIDER=openai|anthropic|local

# OpenAI
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=gpt-4o-mini

# Anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_BASE_URL=...
ANTHROPIC_MODEL=claude-3-5-sonnet-latest

# Local OpenAI-compatible (Ollama, LM Studio, etc.)
LOCAL_BASE_URL=http://localhost:11434/v1
LOCAL_MODEL=llama3.1
```

Default `LLM_ENABLED=false`. The demo flow described in
`docs/interview-demo-guide.md` runs entirely offline.

## Repo-level verification (Phase 6)

End-to-end checks (Docker API + full Karate) live next to the repo root:

- `scripts/verify.ps1` (Windows PowerShell)
- `scripts/verify.sh` (bash; `chmod +x` once)

They are documented in [`README.md`](../README.md) and
[`interview-demo-guide.md`](./interview-demo-guide.md). They do **not**
replace `python -m tools.cli doctor`; use both when preparing a laptop
for a demo.

## Tests

Pure-functional core tests live under `tools/tests/`:

```bash
python -m pytest tools\tests -q
```

These lock in the deterministic categoriser + the scaffold renderer
without needing a running server.

## Future extensions (not implemented in v1)

- Playwright Python smoke tests for the Karate report HTML pages.
- Contract diff between two OpenAPI snapshots (`scaffold contract-diff`).
- Synthetic data CLI that emits 837-like payload variants from real-world distributions.
- LLM-narrated failure summaries in `analyze` (still gated by `LLM_ENABLED`).
