# ASF Engineering Documentation

Architecture and execution contracts for the Autonomous Software Factory (ASF). These documents follow the P0 requirement fixes and are the authoritative source for implementation kickoff.

**v1 default:** Local-first on the operator's Mac — Bun control plane, SQLite state, CLI agent subprocesses. Cloudflare orchestrator is Phase 2; Cloudflare remains a deploy target for generated apps. See [ADR-001](./ADR-001-local-first-topology.md).

## Documents

| Document | Description |
|----------|-------------|
| [ADD.md](./ADD.md) | Architecture Design Document — components, data model, orchestration, deployment, security |
| [workflow-dsl.md](./workflow-dsl.md) | Workflow DSL specification — nodes, edges, state machine, events, APIs |
| [agent-contracts.md](./agent-contracts.md) | Agent Contracts v1 — per-type inputs, outputs, tool allowlists, timeouts |
| [cli-reference.md](./cli-reference.md) | `asf` CLI — commands, env vars, example operator flows |
| [agent-runtime.md](./agent-runtime.md) | Agent execution — schedule → spawn → LLM loop → completeTask |

## Implementation Plans

| Plan | Description |
|------|-------------|
| [plans/v1-implementation-plan.md](./plans/v1-implementation-plan.md) | **v1 kickoff** — milestones M0–M5, package layout, CRM E2E path |
| [plans/README.md](./plans/README.md) | Plan index |

## Architecture Decision Records

| ADR | Decision |
|-----|----------|
| [ADR-001-local-first-topology.md](./ADR-001-local-first-topology.md) | v1 control plane = local Bun server + SQLite; Cloudflare orchestrator deferred to Phase 2 |
| [ADR-002-cli-agent-runtime.md](./ADR-002-cli-agent-runtime.md) | v1 agents = `asf agent run` subprocess (Cursor/Claude); no Docker for agent execution |

## Relationship to Requirements

```
requirements/          ← Product requirements (FR-01–FR-20, framework)
       │
       ▼
docs/                  ← Engineering contracts (this folder)
       │
       ▼
implementation/        ← Code (packages/workflow-engine spike)
```

| Requirements | Resolved In |
|--------------|-------------|
| [01-core-concepts.md](../requirements/01-core-concepts.md) — Mission SUCCESS gate | ADD § Mission Derivation, workflow-dsl § Gates |
| [framework/workflow-engine.md](../requirements/framework/workflow-engine.md) — Sole state writer, leases | ADD § TaskExecution, workflow-dsl § State Transitions |
| [framework/security.md](../requirements/framework/security.md) | ADD § Security Architecture |
| [functional/FR-05-task-planner.md](../requirements/functional/FR-05-task-planner.md) — Task types | workflow-dsl § Node Types, agent-contracts |
| [functional/FR-07-agent-execution.md](../requirements/functional/FR-07-agent-execution.md) | agent-contracts.md, ADR-002 |
| [functional/FR-14-self-healing-loop.md](../requirements/functional/FR-14-self-healing-loop.md) | workflow-dsl § healing-child nodes |
| [fixtures/reference-crm-mission.md](../requirements/fixtures/reference-crm-mission.md) | workflow-dsl § CRM Example |
| [requirements/schemas/](../requirements/schemas/) | JSON Schema for mission, plan, events, reports |

## Review Status

| Review | Status |
|--------|--------|
| [requirements/reviews/cross-review-synthesis.md](../requirements/reviews/cross-review-synthesis.md) | P0 requirements remediation — complete |
| [docs/reviews/cross-review-synthesis.md](./reviews/cross-review-synthesis.md) | Five-lens `docs/` review — **P0 doc fixes applied 2026-06-22** |
| Local-first pivot ADRs | **Accepted 2026-06-22** — ADR-001, ADR-002; ADD §11 updated |
| Implementation kickoff | **Conditional GO** — schemas published; workflow-engine spike on Mac |

Re-run five-lens review after Workflow Engine + CRM DAG simulation (no LLM).

## Implementation Sequence

1. **JSON schemas** — `requirements/schemas/` (published)
2. **P0 doc fixes** — workflow-dsl, ADD, requirements reconciliation (done)
3. **Local-first ADRs** — ADR-001, ADR-002; ADD §11 local topology (done)
4. **Workflow engine on Mac** — `packages/workflow-engine` Bun server + SQLite (in progress)
5. **CLI agent runtime** — `asf agent run` subprocess + MCP Proxy (next)
6. **Core implementation** — Agent Runtime → reference CRM E2E with real LLM ([v1 plan](./plans/v1-implementation-plan.md))
