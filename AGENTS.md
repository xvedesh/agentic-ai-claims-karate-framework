# AGENTS.md — Multi-Agent Topology

This file documents the agents that operate **on** this repository. It
distinguishes the two layers explicitly and is the human-readable
counterpart to any `.cursor/rules/*.mdc` rule files we add later.

- **Founder / Product Owner:** the human. All scope and release
  decisions rest here.
- **Builder-time agents:** Cursor / Claude Code personas that *develop*
  this sandbox. Documented below.
- **Runtime SDET tooling agents:** the Python CLI tools under `tools/`.
  Documented in [`docs/ai-sdet-tooling.md`](docs/ai-sdet-tooling.md).

The two layers share **no code**. Renaming a Python tool does not
touch any builder persona, and vice versa.

## 1. Topology

```
                 Founder (Product Owner)
                          │
                          ▼
              ┌──────────────────────────┐
              │   Root Orchestrator      │
              └────────────┬─────────────┘
                           │ decomposes → DAG of leaf specialists
            ┌──────────┬───┴───┬──────────────┬──────────────────┐
            ▼          ▼       ▼              ▼                  ▼
    Healthcare    Backend /  Rules Engine  Karate SDET    Verification /
    Domain        API                                     Review
    Analyst      Engineer
                                  + Documentation Compliance Agent (Docs Scribe)
```

One-way flow. Specialists are leaf nodes; they never dispatch further
specialists. If cross-boundary work is uncovered, the specialist
returns a handoff summary and the orchestrator re-dispatches.

## 2. Specialist index (builder-time)

| Role | Scope (path globs) | Verification obligation |
|---|---|---|
| **Orchestrator** | repo-wide, dispatch only | Refuses to skip docs/tests in any phase. |
| **Healthcare Domain Analyst** | `docs/data-flow.md`, `docs/business-rules.md` | Cites a real-world analog for every rule. |
| **Backend / API Engineer** | `server/**`, `docs/openapi/claims-api.yaml` | Every endpoint has a Karate feature before merge. |
| **Rules Engine** | `server/rules/**` | Every rule has positive + guardrail features. |
| **Karate SDET** | `src/test/**` | Every rule code appears in ≥1 `@regression` scenario. |
| **Verification / Review** | `target/**`, `reports/**` | Refuses sign-off on doc drift. |
| **Documentation Compliance** (Docs Scribe) | `docs/**`, `README.md`, `AGENTS.md` | Maintains [`docs/knowledge-sync-matrix.md`](docs/knowledge-sync-matrix.md). |

The Documentation Compliance Agent is **mandatory** per the project
brief and has veto power on changes that break the docs-sync matrix.

## 3. Runtime SDET tooling agents (Python CLI)

These run on the SDET's machine, not on end-user traffic, and serve
the developer workflow only. Full contract:
[`docs/ai-sdet-tooling.md`](docs/ai-sdet-tooling.md).

| Tool | Module | Purpose |
|---|---|---|
| **Setup Doctor** | `tools/agents/setup_doctor.py` | health check, smoke runner, doc explainer |
| **Failure Analyzer** | `tools/agents/failure_analyzer.py` | parse reports, categorize failures, propose fixes (never auto-apply) |
| **Karate Scaffold Generator** | `tools/agents/karate_scaffold.py` | generate draft features from OpenAPI / rules into `generated/` |

Hard invariants for Layer B:

- never replace the deterministic rules engine;
- never call an LLM during the basic offline demo;
- never write into `src/test/resources/features/` directly;
- never auto-apply patches.

## 4. Phase gates (Orchestrator pauses for human approval)

- end of Phase 0 — skeleton (this checkpoint)
- end of Phase 4 — MVP Karate suite green
- end of Phase 8 — all 3 SDET tools functional
- end of Phase 11 — full demo dry-run captured in demo guide (`docs/demo-guide.md`)
