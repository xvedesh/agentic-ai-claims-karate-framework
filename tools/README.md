# `tools/` — AI/SDET Tooling (Layer B)

This is the optional Python tooling layer that sits **around** the framework.
It never participates in claim adjudication and never imports the Node service.

## Install (one-time)

```bash
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate

pip install -e .[dev]
```

## Commands (Phase 5 — delivered)

```bash
python -m tools.cli doctor
python -m tools.cli run-smoke
python -m tools.cli explain rules            # also: setup, tags, reports, agents, tools, troubleshooting

python -m tools.cli analyze                  # writes reports/ai-failure-analysis.{md,json,html}
python -m tools.cli propose-fix              # writes reports/failure-fix-proposals.md
python -m tools.cli propose-fix --emit-patches  # plus advisory diff stubs in reports/patches/

python -m tools.cli scaffold from-openapi --tag claims
python -m tools.cli scaffold from-rule --rule FRAUD_DUPLICATE_CLAIM
python -m tools.cli scaffold suggest         # writes reports/test-generation-plan.md
```

Run the unit tests for the tooling itself:

```bash
python -m pytest tools/tests -q
```

Full contract: [`docs/ai-sdet-tooling.md`](../docs/ai-sdet-tooling.md).

## Repo-level E2E (Docker + Karate)

From the repository root (Docker running):

```bash
./scripts/verify.sh
```

Windows:

```powershell
.\scripts\verify.ps1
```

These scripts orchestrate `docker compose` and `mvnw test`; they are not
part of the `tools.cli` package itself.

## LLM mode (off by default)

```bash
$env:LLM_ENABLED = "true"
$env:LLM_PROVIDER = "openai"      # or "anthropic" or "local"
$env:OPENAI_API_KEY = "..."        # provider-specific
```

See `tools/agents/_common/llm.py` for the full env contract.
