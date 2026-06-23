# FR-07 — Agent Execution

## Summary

ASF must orchestrate specialized autonomous agents — Planner, Research, Architect, Backend, Frontend, Infra, Testing, and Fix — assigning each to tasks matching its capability profile and managing execution through the agent framework lifecycle.

## User Story

> As the ASF platform, I need the right specialist agent working on each task so that research agents don't write code and backend agents don't design databases.

## System Story

> As the Agent Execution runtime, I must maintain an agent type registry, match tasks to agent types, spawn agent instances, bind them to ACP sessions, monitor execution, and record outcomes for the workflow engine.

## Requirements

1. The system MUST support the following agent types with defined capability profiles:

| Agent Type | Capabilities | MCP Tools |
|------------|-------------|-----------|
| `requirement-discovery` | Domain analysis, requirements authoring | filesystem, memory, web |
| `research` | External search, synthesis | filesystem, memory, web, context7 |
| `architect` | System design, API/schema design | filesystem, memory |
| `planner` | Task decomposition | filesystem, memory |
| `backend-engineer` | Server code, migrations, APIs | filesystem, git, terminal, memory, database |
| `frontend-engineer` | UI code, styling, client logic | filesystem, git, terminal, memory, browser |
| `infra-engineer` | CI/CD, Docker, IaC, env config | filesystem, git, terminal, deployment |
| `testing` | Test authoring and execution | filesystem, git, terminal, browser |
| `fix` | Defect analysis and patching | filesystem, git, terminal, memory |
| `deployment` | Target environment deployment | filesystem, git, terminal, deployment |
| `verification` | Post-deploy health, API smoke, UI, auth checks | filesystem, terminal, browser |

2. Task `assignedAgentType` MUST match a registered agent type; unknown types MUST fail at scheduling time.
3. Agent instances MUST follow lifecycle: `CREATED → ASSIGNED → RUNNING → COMPLETED | FAILED` (see agent-framework.md).
4. Only one agent instance MAY be `RUNNING` per task at a time.
5. The system MUST enforce tool access per agent type (deny unauthorized MCP calls).
6. Agent execution MUST occur within an ACP session (FR-08).
7. On `COMPLETED`, agent MUST report: artifacts produced, git commits made, summary message.
8. On `FAILED`, agent MUST report: error classification, logs, partial artifacts.
9. The system SHOULD support configurable concurrency limits per agent type (default: 2 parallel backend tasks).
10. Agent prompts/contracts MUST be versioned and pinned per mission start.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Task assignment event | `{ taskId, agentType }` |
| Input | Agent context bundle | FR-19 retrieval result |
| Output | Agent execution record | JSON (DB) |
| Output | Task artifacts | Workspace files |
| Output | Agent logs | Structured JSON logs |

## Acceptance Criteria

- [ ] Backend task assigned only to `backend-engineer` agent
- [ ] Frontend agent cannot invoke `deployment.deploy` MCP tool
- [ ] Agent lifecycle transitions logged and visible in Agent View
- [ ] Completed agent reports include artifact file paths
- [ ] Failed agent triggers failure detection (FR-13)
- [ ] Concurrency limit prevents > N simultaneous agents of same type

## Dependencies

- FR-05 — Task definitions with agent types
- FR-08 — ACP sessions
- FR-19 — Context retrieval
- [framework/agent-framework.md](../framework/agent-framework.md)
- [framework/mcp-integration.md](../framework/mcp-integration.md)

## Non-Goals

- User-defined custom agent types (v1)
- Agent-to-agent direct messaging (coordination via memory/workflow only)
- Human agent hybrid mode

## Open Questions

1. Agent binary isolation: separate processes vs. shared runtime?
2. LLM model selection per agent type?
3. Agent handoff protocol when task needs multiple specialties?

## Examples

**Task assignment event:**

```json
{
  "event": "agent.assign",
  "taskId": "t-contacts-api",
  "agentType": "backend-engineer",
  "contextRef": "ctx-t-contacts-api-001"
}
```

**Agent completion report:**

```json
{
  "agentId": "a-9f8e7d6c-...",
  "taskId": "t-contacts-api",
  "status": "COMPLETED",
  "artifacts": [
    "packages/api/src/routes/contacts.ts",
    "packages/api/src/routes/contacts.test.ts"
  ],
  "commits": ["abc1234"],
  "summary": "Implemented CRUD endpoints per openapi.yaml paths /api/contacts"
}
```
