# Builder-time Agent Workflow

> Status: maintained. Owner: Documentation Compliance Agent.
>
> This document covers the **builder-time** agent roster (Cursor / Claude Code
> personas). The **runtime** SDET tooling agents (Python CLI under `tools/`)
> are documented separately in [`ai-sdet-tooling.md`](./ai-sdet-tooling.md).

## DAG (one-way flow)

```
Founder
   │
   ▼
Root Orchestrator
   │  decomposes → DAG of leaf specialists; aggregates results
   ▼
┌────────────────┬──────────────────┬─────────────┬──────────────────┐
▼                ▼                  ▼             ▼                  ▼
Healthcare       Backend / API     Rules Engine   Karate SDET        Verification / Review
Domain Analyst   Engineer
                                                  + Documentation Compliance Agent (Docs Scribe)
```

Specialists are leaf nodes. They never dispatch further specialists.
If a specialist uncovers cross-boundary work, it returns a handoff
summary and the orchestrator re-dispatches.

## Specialist index

| Role | Scope | Verification obligation |
|---|---|---|
| **Orchestrator Agent** | overall dispatch, TodoWrite, checkpoints | Refuses to skip docs/tests in any phase. |
| **Healthcare Domain Analyst Agent** | `docs/data-flow.md`, `docs/business-rules.md`, encounter/claim shapes | Cites a real-world analog for every rule. |
| **Backend / API Engineer Agent** | `server/**`, `docs/openapi/claims-api.yaml` | Every endpoint has a Karate feature before merge. |
| **Rules Engine Agent** | `server/rules/**` | Every rule ships with positive + guardrail features. |
| **Karate SDET Agent** | `src/test/**` | Every rule code appears in at least one `@regression` scenario. |
| **Verification / Review Agent** | `target/`, `reports/` | Refuses sign-off on doc drift. |
| **Documentation Compliance Agent** (Docs Scribe) | `docs/**`, `README.md`, `AGENTS.md` | Maintains `docs/knowledge-sync-matrix.md`. Blocks merges with stale docs. |

## Documentation Compliance Agent — special status

The Documentation Compliance Agent is **mandatory** per the project brief and
has veto power on any change that breaks the docs-sync matrix. Its enforcement
source lives at [`knowledge-sync-matrix.md`](./knowledge-sync-matrix.md).

## Original plan reconciliation (Phases 0–11 → current)

The **original** roadmap used twelve numbered phases (0–11). Delivery
compressed the later phases for checkpoint efficiency:

| Original phase | Original intent | Current mapping |
|----------------|-----------------|-------------------|
| 0 | Scaffold | **Current Phase 0** — repo skeleton |
| 1 | Node service core | **Current Phase 1** |
| 2 | Pipeline + 835-like + events | **Current Phase 2** |
| 3 | Rules engine + 9 FWA rules | **Current Phase 3** |
| 4 | Karate suite | **Current Phase 4** |
| 5 | OpenAPI finalization | **Merged into current Phase 5** (spec bumped to **0.4.0** alongside tooling) |
| 6 | Setup Doctor | **Merged into current Phase 5** (`tools/agents/setup_doctor.py`) |
| 7 | Failure Analyzer + proposals | **Merged into current Phase 5** (`failure_analyzer.py`, `propose-fix`) |
| 8 | Karate Scaffold Generator | **Merged into current Phase 5** (`karate_scaffold.py`) |
| 9 | Docker Compose | **Merged into current Phase 6** (`docker-compose.yml`, `server/Dockerfile`) |
| 10 | Documentation pass | **Merged into current Phase 6** (README, guides, matrix, architecture) |
| 11 | Final verification + demo dry-run | **Merged into current Phase 6** (`scripts/verify.*`, `interview-demo-guide.md`, `interview-project-summary.md`, `.github/workflows/ci.yml`) |

Nothing in the original **0–4** technical scope was dropped: Layer A, rules,
and the Karate MVP are complete. Original **5–8** are all present in one
**Phase 5** delivery (OpenAPI + three CLI agents). Original **9–11** are
present in **Phase 6** (packaging, docs, verification entry points, CI).

**Intentionally deferred (not a gap for v1):** Karate-in-Docker / heavy Java
container in Compose (API-only Compose + host Karate was an explicit product
decision).

## Phase gates (human checkpoints)

The Orchestrator pauses for human approval at:

- end of Phase 0 (skeleton)
- end of Phase 4 (Karate suite green on MVP)
- end of Phase 5 (OpenAPI sync + AI/SDET tooling — covers original 5–8)
- end of Phase 6 (Docker + interview + CI — covers original 9–11)
- optional: formal programme dry-run (recorded session) — on you, not repo-gated
