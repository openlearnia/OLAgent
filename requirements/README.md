# Autonomous Software Factory (ASF) — Requirements Index

Engineering-ready product requirements for a self-driving software development platform. Downstream engineering contracts live in [`docs/`](../docs/README.md) (ADD, Workflow DSL, Agent Contracts).

## How to Read These Docs

| Prefix | Meaning |
|--------|---------|
| `00–02` | Vision, concepts, and system architecture |
| `FR-XX` | Functional requirements (testable capabilities) |
| `framework/` | Cross-cutting platform infrastructure |
| `future/` | Explicitly out-of-scope v1 enhancements |
| `reviews/` | Adversarial review synthesis and findings |
| `schemas/` | JSON Schema v1 contracts (mission, plan, execution, events) |
| `fixtures/` | Reference missions and acceptance oracles |

Documents follow a consistent template: **ID & Title**, **Summary**, **User/System Story**, **Requirements**, **Inputs/Outputs/Artifacts**, **Acceptance Criteria**, **Dependencies**, **Non-Goals**, **Open Questions**, **Examples**.

---

## Engineering Contracts

| Document | Description |
|----------|-------------|
| [docs/README.md](../docs/README.md) | Index to ADD, Workflow DSL, and Agent Contracts |
| [docs/ADD.md](../docs/ADD.md) | Architecture Design Document |
| [docs/workflow-dsl.md](../docs/workflow-dsl.md) | Workflow DSL specification |
| [docs/agent-contracts.md](../docs/agent-contracts.md) | Agent Contracts v1 |
| [docs/plans/v1-implementation-plan.md](../docs/plans/v1-implementation-plan.md) | **v1 implementation plan** — milestones M0–M5c, sprint sequencing |
| [docs/ADR-003-cursor-acp-primary-backend.md](../docs/ADR-003-cursor-acp-primary-backend.md) | **Cursor ACP primary backend** — Agent Client Protocol decision |

---

## Foundation

| Document | Description |
|----------|-------------|
| [00-overview.md](./00-overview.md) | Purpose, vision, goals, non-goals, and success criteria |
| [01-core-concepts.md](./01-core-concepts.md) | Mission, Task, Agent, Workflow — domain vocabulary |
| [02-proposed-architecture.md](./02-proposed-architecture.md) | End-to-end architecture, data flow, and component boundaries |

---

## Functional Requirements

| ID | Document | Description |
|----|----------|-------------|
| FR-01 | [mission-creation.md](./functional/FR-01-mission-creation.md) | Accept NL prompts or structured mission files to initiate work |
| FR-02 | [requirement-discovery-agent.md](./functional/FR-02-requirement-discovery-agent.md) | Domain research and `requirements.md` generation |
| FR-03 | [research-agent.md](./functional/FR-03-research-agent.md) | External knowledge gathering into `research-report.md` |
| FR-04 | [architecture-agent.md](./functional/FR-04-architecture-agent.md) | System design artifacts: architecture, schema, OpenAPI |
| FR-05 | [task-planner.md](./functional/FR-05-task-planner.md) | Decompose requirements into epics and executable tasks |
| FR-06 | [dependency-management.md](./functional/FR-06-dependency-management.md) | Task dependency graph construction and resolution |
| FR-07 | [agent-execution.md](./functional/FR-07-agent-execution.md) | Specialized agent types and execution orchestration |
| FR-08 | [acp-integration.md](./functional/FR-08-acp-integration.md) | Isolated **execution sessions** per task; Cursor ACP per ASF-FW-ACP |
| FR-09 | [code-generation.md](./functional/FR-09-code-generation.md) | Source, test, and documentation generation/modification |
| FR-10 | [git-operations.md](./functional/FR-10-git-operations.md) | Branching, commits, and merge-after-validation |
| FR-11 | [browser-automation-framework.md](./functional/FR-11-browser-automation-framework.md) | Browser MCP primitives for UI interaction and observation |
| FR-12 | [autonomous-testing.md](./functional/FR-12-autonomous-testing.md) | Unit, integration, browser, and API test execution |
| FR-13 | [failure-detection.md](./functional/FR-13-failure-detection.md) | Build, test, deployment, and runtime error detection |
| FR-14 | [self-healing-loop.md](./functional/FR-14-self-healing-loop.md) | Detect → analyze → fix → apply → retest cycle |
| FR-15 | [retry-policy.md](./functional/FR-15-retry-policy.md) | Configurable retries and mission blocking on exhaustion |
| FR-16 | [deployment-agent.md](./functional/FR-16-deployment-agent.md) | v1 deployment targets: Cloudflare and Docker |
| FR-17 | [deployment-verification.md](./functional/FR-17-deployment-verification.md) | Post-deploy health, API, UI, and auth validation |
| FR-18 | [long-term-memory.md](./functional/FR-18-long-term-memory.md) | Persistent mission knowledge across the lifecycle |
| FR-19 | [knowledge-retrieval.md](./functional/FR-19-knowledge-retrieval.md) | Context retrieval for agents before execution |
| FR-20 | [autonomous-continuation.md](./functional/FR-20-autonomous-continuation.md) | Automatic progression to the next eligible task |

---

## Framework & Platform

| Document | Description |
|----------|-------------|
| [agent-framework.md](./framework/agent-framework.md) | Agent lifecycle, context model, and recovery semantics |
| [cli-agent-runtime.md](./framework/cli-agent-runtime.md) | `asf` CLI commands, agent subprocess lifecycle, Workflow Engine integration |
| [acp-cursor-integration.md](./framework/acp-cursor-integration.md) | **ASF-FW-ACP** — Cursor `agent acp` / Agent Client Protocol client adapter |
| [process-sandbox.md](./framework/process-sandbox.md) | v1 process-per-session isolation (no Docker) |
| [workflow-engine.md](./framework/workflow-engine.md) | Task states, scheduling, and parallel execution |
| [mcp-integration.md](./framework/mcp-integration.md) | MCP server surface: filesystem, git, browser, memory, etc. |
| [monitoring.md](./framework/monitoring.md) | Agent and mission observability metrics |
| [user-interface.md](./framework/user-interface.md) | Mission Dashboard, Task View, and Agent View |
| [security.md](./framework/security.md) | Platform security: process sandbox (v1), container isolation (Phase 2), vault, approval gates, allowlists |

---

## Reviews

| Document | Description |
|----------|-------------|
| [cross-review-synthesis.md](./reviews/cross-review-synthesis.md) | Five-lens adversarial review synthesis and P0 remediation status |
| [docs/reviews/cross-review-synthesis.md](../docs/reviews/cross-review-synthesis.md) | Five-lens review of engineering docs (ADD, DSL, contracts) |

---

## Schemas

| Schema | Description |
|--------|-------------|
| [mission.v1.json](./schemas/mission.v1.json) | Mission entity |
| [tasks-plan.v1.json](./schemas/tasks-plan.v1.json) | Planner `tasks/plan.json` |
| [task-execution.v1.json](./schemas/task-execution.v1.json) | Runtime execution state |
| [agent-result.v1.json](./schemas/agent-result.v1.json) | Agent completion payload |
| [failure-report.v1.json](./schemas/failure-report.v1.json) | FR-13 failure reports |
| [verification-report.v1.json](./schemas/verification-report.v1.json) | FR-17 verification output |
| [events/workflow-event.v1.json](./schemas/events/workflow-event.v1.json) | Workflow event discriminated union |

---

## Fixtures

| Document | Description |
|----------|-------------|
| [reference-crm-mission.md](./fixtures/reference-crm-mission.md) | Reference mission oracle for CRM end-to-end acceptance criteria |
| [local-operator-mission.yaml](./fixtures/local-operator-mission.yaml) | `mission.yaml` fixture for local `asf mission create` CLI workflow |

---

## Future

| Document | Description |
|----------|-------------|
| [future-enhancements.md](./future/future-enhancements.md) | Multi-repo missions, marketplace, cost optimization, and more |

---

## Dependency Graph (High Level)

```
FR-01 → FR-02, FR-03 → FR-04 → FR-05 → FR-06
                              ↓
                    FR-07 + FR-08 + FR-19
                              ↓
              FR-09 → FR-10 → FR-11 → FR-12
                              ↓
                    FR-13 → FR-14 → FR-15
                              ↓
                    FR-16 → FR-17 → FR-20
                              ↓
                         FR-18 (cross-cutting)

schemas/ ── validates ──► plan.json, events, reports (see docs/workflow-dsl.md)
```

Framework docs (`agent-framework`, `cli-agent-runtime`, `process-sandbox`, `workflow-engine`, `mcp-integration`, `security`, `monitoring`, `user-interface`) underpin all functional requirements.
