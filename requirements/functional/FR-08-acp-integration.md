# FR-08 — ACP Integration

## Summary

Each task executes within an isolated Agent Context Protocol (ACP) session that provides sandboxed tool access, bounded context, and clean teardown — ensuring agents cannot leak state or interfere across tasks. v1 uses **process-per-session** isolation spawned via `asf agent run` ([framework/cli-agent-runtime.md](../framework/cli-agent-runtime.md), [framework/process-sandbox.md](../framework/process-sandbox.md)).

## User Story

> As the ASF platform, I need each agent task to run in isolation so that filesystem changes, environment variables, and tool state from one task don't corrupt another.

## System Story

> As the ACP runtime, I must create a session per task assignment via CLI subprocess spawn, inject mission/task context, expose authorized MCP tools, stream execution telemetry, post `completeTask` to the Workflow Engine, and destroy the session on completion or failure.

## Requirements

1. The system MUST create one ACP session per task execution attempt (including retries).
2. **v1 isolation model (resolved):** Each session MUST run in a **dedicated OS subprocess** (process-per-session) spawned by `asf agent run`. MCP proxy enforces workspace boundaries and tool allowlists. See [framework/process-sandbox.md](../framework/process-sandbox.md). Container-per-session is Phase 2 for untrusted missions — see [framework/security.md](../framework/security.md) § Phase 2 Container Isolation.
3. Each session MUST be scoped to:
   - Mission workspace root (read/write within boundary)
   - Authorized MCP servers per agent type (FR-07)
   - Task-specific environment variables (non-secret config only; secrets via vault injection)
4. Session lifecycle: `CREATED → ACTIVE → TERMINATED` (success) or `CREATED → ACTIVE → FAILED → TERMINATED`.
5. Sessions MUST NOT share:
   - In-memory agent state
   - Terminal shell sessions
   - Browser instances
   - Git index locks
6. Context injection at session start MUST include (from FR-19):
   - Mission goal and constraints
   - Task description and acceptance criteria
   - Relevant memory excerpts
   - Dependency artifact paths
   - Prior failure reports (on retry)
7. Session MUST enforce timeouts: default 2 hours wall-clock, configurable per task type.
8. Session MUST capture: tool calls, LLM turns, token usage, stdout/stderr — persisted for monitoring.
9. On termination, session resources (agent subprocess, browser, terminal children) MUST be released within 60 seconds.
10. Session ID MUST be recorded on agent instance and task execution record.
11. Cross-session communication MUST occur only via persisted artifacts (files, memory, git) — no shared memory between concurrent sessions.
12. Workflow Engine MUST spawn sessions by invoking `asf agent run`; agents MUST NOT self-schedule.
13. CLI subprocess MUST post `completeTask` to Workflow Engine before exit; engine is sole task-state writer.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Task assignment + context bundle | JSON |
| Output | `acpSessionId` | UUID string |
| Output | Session telemetry | JSON log stream |
| Output | Session summary | Token count, duration, tool call count |

## Acceptance Criteria

- [ ] Two concurrent tasks have distinct `acpSessionId` values and distinct OS PIDs
- [ ] Backend session cannot write outside mission workspace (path traversal blocked at MCP proxy)
- [ ] Session timeout terminates agent and marks task failed
- [ ] Token usage recorded per session in monitoring
- [ ] Browser MCP instance not shared between sessions
- [ ] Retry creates new session with prior failure context injected

## Dependencies

- FR-07 — Agent execution
- FR-19 — Context bundle
- [framework/agent-framework.md](../framework/agent-framework.md)
- [framework/mcp-integration.md](../framework/mcp-integration.md)
- [framework/cli-agent-runtime.md](../framework/cli-agent-runtime.md) — CLI spawn model
- [framework/process-sandbox.md](../framework/process-sandbox.md) — v1 process isolation
- [framework/security.md](../framework/security.md) — Allowlists, vault, Phase 2 containers
- [framework/monitoring.md](../framework/monitoring.md)

## Non-Goals

- ACP protocol specification (consume existing ACP standard)
- Interactive human takeover mid-session (v1)
- Session recording playback UI (v1)

## Open Questions

1. Secret injection mechanism (Vault, env file, Cloudflare secrets) — see [framework/security.md](../framework/security.md) vault outline.
2. Session pause/resume for long-running tasks?

> **Resolved (v1):** Process-per-session isolation via `asf agent run` subprocess — see requirement 2 and [framework/process-sandbox.md](../framework/process-sandbox.md). Container-per-session deferred to Phase 2 ([framework/security.md](../framework/security.md)).

## Examples

**Session creation request:**

```json
{
  "taskId": "t-contacts-api",
  "agentType": "backend-engineer",
  "workspace": "workspaces/m-7f3a2b1c-.../",
  "isolation": "process",
  "mcpServers": ["filesystem", "git", "terminal", "memory", "database"],
  "context": {
    "missionGoal": "Build a CRM for small businesses",
    "taskDescription": "Implement /api/contacts CRUD per openapi.yaml",
    "artifacts": ["openapi.yaml", "database-schema.md"],
    "memoryRefs": ["mem-req-001", "mem-arch-003"]
  },
  "timeoutMs": 7200000
}
```

**Session telemetry event:**

```json
{
  "acpSessionId": "acp-s-4a3b2c1d-...",
  "event": "tool.call",
  "tool": "filesystem.write",
  "path": "packages/api/src/routes/contacts.ts",
  "timestamp": "2026-06-22T10:15:00Z"
}
```
