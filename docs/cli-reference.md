# ASF CLI Reference

**Version:** 1.0.0  
**Status:** Engineering-ready  
**Date:** 2026-06-22  
**Binary:** `asf` (Bun-compiled entrypoint)

Operator-facing command surface for the Autonomous Software Factory. The CLI creates missions, starts the local engine, watches progress, and (when spawned by the Agent Runtime) executes individual agent tasks via `asf agent run`.

---

## 1. Overview

| Role | Commands |
|------|----------|
| **Operator** | `server`, `mission create`, `mission start`, `mission status`, `mission watch` |
| **Agent Runtime** | `agent run` (spawned by engine scheduler — not invoked manually in production) |
| **Developer** | `dev token` (sign internal JWT for local curl) |

The CLI talks to:

- **Mission Manager API** — public routes (`/v1/*`) for mission CRUD and status
- **Workflow Engine** — internal routes (`/internal/v1/*`) for scheduling, completion, heartbeat

In local development, `asf server start` runs both surfaces in one Bun process (see [workflow-engine README](../packages/workflow-engine/README.md)).

---

## 2. Command Tree

```
asf
├── server
│   └── start [--host] [--port] [--db-path]
├── mission
│   ├── create [--file <path>] [--goal <text>] [--idempotency-key <key>]
│   ├── start <missionId>
│   ├── status <missionId> [--json]
│   ├── watch <missionId> [--interval <seconds>] [--events]
│   └── events <missionId> [--limit <n>] [--follow]
├── agent
│   └── run --bundle <path> [--dry-run] [--no-heartbeat]
└── dev
    └── token [--ttl <seconds>]   # local only; signs ASF_INTERNAL_JWT_SECRET
```

### Global flags (all commands)

| Flag | Env fallback | Default | Description |
|------|--------------|---------|-------------|
| `--engine-url <url>` | `ASF_ENGINE_URL` | `http://127.0.0.1:3100` | Workflow Engine / MM API base URL |
| `--home <path>` | `ASF_HOME` | `~/.asf` | Config, caches, default workspace root |
| `--verbose` / `-v` | `ASF_VERBOSE=1` | off | Structured debug logs to stderr |
| `--json` | — | off | Machine-readable stdout (where applicable) |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | User input / validation error |
| `2` | Engine or network error |
| `3` | Agent execution failure (`agent run` only) |
| `4` | Lease expired or engine rejected completion |
| `130` | Interrupted (SIGINT) |

---

## 3. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ASF_HOME` | No | `~/.asf` | Root for local config (`config.toml`), workspace parent dir, agent logs |
| `ASF_ENGINE_URL` | No | `http://127.0.0.1:3100` | API base for CLI HTTP client |
| `ASF_INTERNAL_JWT_SECRET` | **Yes** (server + `agent run`) | — | HMAC secret for `/internal/v1/*` JWT (`aud: asf-internal`) |
| `ASF_WORKSPACES_ROOT` | No | `$ASF_HOME/workspaces` | Parent of `workspaces/{missionId}/` directories |
| `WORKFLOW_DB_PATH` | No | `$ASF_HOME/workflow.db` | SQLite path when running `asf server start` |
| `HOST` | No | `127.0.0.1` | Server bind host |
| `PORT` | No | `3100` | Server bind port |
| `ASF_LLM_PROVIDER` | No | `anthropic` | LLM backend for `agent run` (`anthropic`, `openai`, `ollama`) |
| `ASF_LLM_API_KEY` | Agent only | — | Provider API key; **never** passed to mission workspace |
| `ASF_MCP_CONFIG` | Agent only | `$ASF_HOME/mcp.json` | MCP server registry for agent sessions |
| `ASF_AGENT_LOG_DIR` | No | `$ASF_HOME/logs/agents` | Per-execution structured logs |

**Security notes:**

- `ASF_INTERNAL_JWT_SECRET` MUST NOT appear in mission workspaces, Context Bundles, or agent telemetry.
- Agent child processes receive a **short-lived execution token** scoped to one `taskExecutionId`, not the platform secret.

---

## 4. Commands

### 4.1 `asf server start`

Start the local Mission Manager + Workflow Engine HTTP server.

```bash
export ASF_INTERNAL_JWT_SECRET=dev-secret-change-me
asf server start
# Listening on http://127.0.0.1:3100
```

| Flag | Description |
|------|-------------|
| `--host <host>` | Bind address (default `127.0.0.1`) |
| `--port <port>` | Bind port (default `3100`) |
| `--db-path <path>` | SQLite file (default `$ASF_HOME/workflow.db`; `:memory:` for tests) |

**Behavior:**

1. Opens or creates SQLite database at `--db-path`.
2. Serves public routes (`GET /v1/missions/:id`, events) and internal routes (JWT-protected).
3. Starts lease sweeper (orphaned `RUNNING` → `FAILED` on expiry).
4. On `task.scheduled` events for agent tasks, invokes **Agent Runtime caller** which spawns `asf agent run` (see [agent-runtime.md](./agent-runtime.md)).

---

### 4.2 `asf mission create`

Create a mission from a YAML/JSON file or inline goal.

```bash
asf mission create --file requirements/fixtures/local-operator-mission.yaml
```

```bash
asf mission create --goal "Build a CRM for small businesses" \
  --constraint deployment=cloudflare \
  --constraint stack=typescript,bun,react
```

| Flag | Description |
|------|-------------|
| `--file <path>` | `mission.yaml` or `mission.json` (schema: [`mission.v1.json`](../requirements/schemas/mission.v1.json)) |
| `--goal <text>` | Inline goal (mutually exclusive with required `goal` in file when file omits it) |
| `--id <missionId>` | Optional fixed ID (`m-{uuid}`); auto-generated if omitted |
| `--idempotency-key <key>` | FR-01 idempotent create |
| `--workspace <path>` | Override workspace root (default `$ASF_WORKSPACES_ROOT/{missionId}`) |

**Output (`--json`):**

```json
{
  "id": "m-crm-local",
  "goal": "Build a CRM for small businesses",
  "status": "PENDING",
  "workspacePath": "/Users/me/.asf/workspaces/m-crm-local",
  "createdAt": "2026-06-22T09:00:00Z"
}
```

**Side effects:**

- Persists mission row + seed bootstrap DAG (`t-discover` → `t-research` → `t-architecture` → `t-plan`).
- Copies mission file to `{workspace}/mission.yaml`.
- Emits `mission.created`.

---

### 4.3 `asf mission start`

Transition mission to `RUNNING` and schedule eligible tasks.

```bash
asf mission start m-crm-local
```

Calls `POST /internal/v1/missions/:id/start` (CLI signs JWT via `ASF_INTERNAL_JWT_SECRET`).

---

### 4.4 `asf mission status`

Snapshot of mission and task execution states.

```bash
asf mission status m-crm-local
```

```
Mission m-crm-local  RUNNING  (8/15 tasks, 53%)
  t-discover          SUCCESS
  t-research          SUCCESS
  t-architecture      SUCCESS
  t-plan              RUNNING   backend-engineer  attempt 1
  ...
```

`GET /v1/missions/:id` — no auth required locally.

---

### 4.5 `asf mission watch`

Poll or stream mission progress until terminal state.

```bash
asf mission watch m-crm-local --interval 5
asf mission watch m-crm-local --events --follow   # SSE when available
```

Exits `0` on `SUCCESS`, `1` on `FAILED`/`BLOCKED`, `130` on interrupt.

---

### 4.6 `asf mission events`

List recent workflow events.

```bash
asf mission events m-crm-local --limit 20
asf mission events m-crm-local --follow
```

---

### 4.7 `asf agent run`

**Primary agent execution entrypoint.** Normally spawned by the Agent Runtime caller when the engine schedules a task — not typed by operators during autonomous runs.

```bash
asf agent run --bundle /tmp/asf-bundles/te-abc123.json
```

| Flag | Required | Description |
|------|----------|-------------|
| `--bundle <path>` | ✅ | JSON Context Bundle + execution metadata (see §6) |
| `--dry-run` | No | Validate bundle + contract; no LLM or MCP |
| `--no-heartbeat` | No | Disable heartbeat loop (tests only) |

**Lifecycle:**

1. Load and validate Context Bundle against agent contract version.
2. Enter process sandbox (local) or container (production).
3. Start MCP servers per contract allowlist.
4. Run LLM tool loop until stop condition or `timeout_ms`.
5. POST `completeTask` with `AgentResult` to engine.
6. Exit `0` on `COMPLETED`, `3` on agent-reported `FAILED`, `4` on lease/engine errors.

See [agent-runtime.md](./agent-runtime.md) for the full sequence.

---

### 4.8 `asf dev token`

Sign a short-lived internal JWT for manual `curl` against `/internal/v1/*`.

```bash
export TOKEN=$(asf dev token)
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:3100/internal/v1/schedule \
  -H 'Content-Type: application/json' \
  -d '{"missionId":"m-crm-local","triggerEventId":"manual","idempotencyKey":"sched-manual-1"}'
```

---

## 5. Example Flows

### 5.1 Local operator: server → CRM mission → watch

```bash
# Terminal 1 — engine
export ASF_INTERNAL_JWT_SECRET=dev-secret-change-me
export ASF_HOME=$PWD/.asf-local
asf server start

# Terminal 2 — operator
asf mission create --file requirements/fixtures/local-operator-mission.yaml
# → m-crm-local

asf mission start m-crm-local
asf mission watch m-crm-local --interval 3
```

Expected progression: bootstrap chain → planner merge → implementation DAG → deploy → `verify-deployment` → mission `SUCCESS`.

### 5.2 Create mission from inline goal

```bash
asf mission create \
  --goal "Build a todo app with Bun and Hono" \
  --constraint deployment=docker \
  --constraint maxRetries=2
```

### 5.3 Inspect failure after healing exhaustion

```bash
asf mission status m-crm-local --json | jq '.tasks[] | select(.status=="BLOCKED")'
asf mission events m-crm-local --limit 50 | grep task.blocked
```

### 5.4 Manual agent run (integration test)

```bash
# Engine writes bundle when scheduling; reproduce for debugging:
asf agent run --bundle .asf-local/bundles/te-debug.json --dry-run
asf agent run --bundle .asf-local/bundles/te-debug.json
```

---

## 6. `agent run` ↔ Agent Contracts

`asf agent run` is the CLI implementation of the execution contract defined in [agent-contracts.md](./agent-contracts.md). Mapping:

| Contract field | `agent run` source |
|----------------|-------------------|
| `agent.type` | `bundle.agentType` → registry lookup |
| `agent.version` | `bundle.contractVersions[agentType]` (pinned at mission start) |
| `inputs.contextBundle` | `bundle.context` → `AgentContext` |
| `inputs.requiredArtifacts` | Validated exist under `bundle.context.workspace` before LLM start |
| `outputs.result` | `AgentResult` POSTed to `completeTask` |
| `tools.allowlist` / `denylist` | MCP Proxy config generated from contract |
| `policies` | Enforced at sandbox + MCP boundary |
| `timeout_ms` | Wall-clock timer in agent process |
| `max_concurrent` | Enforced by engine scheduler (not agent) |

### 6.1 Context Bundle file shape

Written by Agent Runtime caller to `$ASF_HOME/bundles/{taskExecutionId}.json`:

```json
{
  "version": "1.0",
  "taskExecutionId": "te-uuid",
  "agentId": "a-uuid",
  "agentType": "backend-engineer",
  "contractVersion": "1.0.0",
  "engineUrl": "http://127.0.0.1:3100",
  "executionToken": "eyJ...",
  "timeoutMs": 7200000,
  "context": {
    "mission": {
      "id": "m-crm-local",
      "goal": "Build a CRM for small businesses",
      "constraints": { "deployment": "cloudflare" }
    },
    "task": {
      "id": "t-contacts-api",
      "type": "implement-backend",
      "title": "Implement /api/contacts CRUD",
      "description": "...",
      "acceptanceCriteria": ["OpenAPI contract satisfied"],
      "dependencies": ["t-schema"],
      "attempt": 1
    },
    "artifacts": [{ "path": "openapi.yaml" }, { "path": "database-schema.md" }],
    "memory": [],
    "priorFailures": [],
    "workspace": "/Users/me/.asf/workspaces/m-crm-local"
  }
}
```

### 6.2 `AgentContext` → TypeScript

Matches [agent-contracts.md §1.1](./agent-contracts.md#11-shared-types):

```typescript
interface AgentContext {
  mission: { id: string; goal: string; constraints: Record<string, unknown> };
  task: {
    id: string; type: string; title: string; description: string;
    acceptanceCriteria: string[]; dependencies: string[]; attempt: number;
    parentTaskId?: string;
  };
  artifacts: Array<{ path: string; summary?: string }>;
  memory: Array<{ kind: string; content: string; relevance: number }>;
  priorFailures: FailureReport[];
  workspace: string;
}
```

### 6.3 `AgentResult` → `completeTask`

Agent process POSTs to `POST /internal/v1/tasks/:taskExecutionId/complete`:

```json
{
  "idempotencyKey": "complete:te-uuid:sha256-of-result",
  "agentId": "a-uuid",
  "result": {
    "status": "COMPLETED",
    "artifacts": ["packages/api/src/routes/contacts.ts"],
    "commits": ["abc1234"],
    "summary": "Implemented CRUD endpoints",
    "metrics": { "tokenUsage": { "input": 12000, "output": 3400 }, "durationMs": 890000 }
  }
}
```

Schema: [`agent-result.v1.json`](../requirements/schemas/agent-result.v1.json).

| `AgentResult` field | Engine effect |
|---------------------|---------------|
| `status: COMPLETED` | `RUNNING → SUCCESS` (unless `needsHealing`) |
| `status: FAILED` + `error.recoverable: true` | `RUNNING → FAILED`, healing subgraph |
| `needsHealing: true` | Same as recoverable failure (FR-14) |
| `status: FAILED` + `recoverable: false` | `RUNNING → BLOCKED` |

---

## 7. Configuration File

Optional `$ASF_HOME/config.toml`:

```toml
[engine]
url = "http://127.0.0.1:3100"

[workspaces]
root = "~/.asf/workspaces"

[llm]
provider = "anthropic"
model = "claude-sonnet-4-20250514"

[agent]
heartbeat_interval_seconds = 30
default_lease_extend_seconds = 120
```

CLI flags override file values.

---

## Related Documents

- [agent-runtime.md](./agent-runtime.md) — execution sequence, sandbox, heartbeat, failure paths
- [agent-contracts.md](./agent-contracts.md) — per-type contracts
- [workflow-dsl.md](./workflow-dsl.md) — engine APIs and state machine
- [ADD.md](./ADD.md) — architecture and security
- [packages/workflow-engine/README.md](../packages/workflow-engine/README.md) — current engine spike
