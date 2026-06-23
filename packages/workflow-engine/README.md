# OLAgent — Workflow Engine Spike

Local workflow engine proving the ASF state machine, planner merge, merge gates, and healing paths — **no LLM**.

> **Agent execution (target):** The engine emits `task.scheduled` events and expects an **Agent Runtime caller** to spawn `asf agent run` subprocesses per assignment. The CRM simulation today uses `StubAgentRuntime` in-process; set `ASF_USE_STUB_AGENTS=1` for CI without LLM. See [docs/agent-runtime.md](../../docs/agent-runtime.md) and [docs/cli-reference.md](../../docs/cli-reference.md).

## Quick start

```bash
cd /path/to/OLAgent
bun install
bun test packages/workflow-engine
```

## What this spike includes

| Area | Location |
|------|----------|
| Workflow engine (SQLite, state table §5.2) | `packages/workflow-engine/src/engine/` |
| Stub agents (golden `AgentResult`) | `packages/workflow-engine/src/agents/stub.ts` |
| CRM DAG simulation | `packages/workflow-engine/src/simulations/crm-mission.ts` |
| Schema validation (Zod) | `packages/workflow-engine/src/schemas/validators.ts` |
| E2E tests | `packages/workflow-engine/tests/` |

## HTTP server (local spike)

Start the Bun HTTP wrapper (internal + public routes):

```bash
export ASF_INTERNAL_JWT_SECRET=dev-secret-change-me
cd packages/workflow-engine
bun run server
```

Default listen address: `http://127.0.0.1:3100`. Override with `PORT` / `HOST`.

### Auth

Internal routes require `Authorization: Bearer <jwt>` signed with `ASF_INTERNAL_JWT_SECRET`:

- `sub`: `agent-runtime` | `workflow-engine` | `system`
- `aud`: `asf-internal`
- short TTL (5 minutes default for dev tokens)

### curl examples

```bash
# Sign a dev token (from repo root after bun install)
TOKEN=$(bun -e "import { signInternalJwt } from './packages/workflow-engine/src/server/auth.ts'; console.log(await signInternalJwt(process.env.ASF_INTERNAL_JWT_SECRET ?? 'dev-secret-change-me'))")

# Start mission (after creating one in-process or via future MM API)
curl -s -X POST "http://127.0.0.1:3100/internal/v1/missions/m-crm-ref/start" \
  -H "Authorization: Bearer $TOKEN"

# Complete task execution
curl -s -X POST "http://127.0.0.1:3100/internal/v1/tasks/<taskExecutionId>/complete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"idempotencyKey":"complete-1","result":{"status":"COMPLETED","artifacts":[],"commits":[],"summary":"done"}}'

# Schedule eligible tasks
curl -s -X POST "http://127.0.0.1:3100/internal/v1/schedule" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"missionId":"m-crm-ref","triggerEventId":"evt-1","idempotencyKey":"sched-1"}'

# Public mission status (no auth)
curl -s "http://127.0.0.1:3100/v1/missions/m-crm-ref"

# Recent workflow events
curl -s "http://127.0.0.1:3100/v1/missions/m-crm-ref/events?limit=20"
```

| Route | Auth |
|-------|------|
| `POST /internal/v1/missions/:id/start` | JWT |
| `POST /internal/v1/tasks/:taskExecutionId/complete` | JWT |
| `POST /internal/v1/tasks/:taskExecutionId/heartbeat` | JWT |
| `POST /internal/v1/schedule` | JWT |
| `GET /v1/missions/:id` | none |
| `GET /v1/missions/:id/events` | none |

## Engine APIs (in-process)

- `WorkflowEngine.createMission()` — seed bootstrap DAG
- `WorkflowEngine.startMission()` → `scheduleTasks`
- `WorkflowEngine.completeTask(taskExecutionId, { idempotencyKey, result })`
- `WorkflowEngine.scheduleTasks({ missionId, triggerEventId, idempotencyKey })`
- `WorkflowEngine.heartbeat(taskExecutionId)` — extends lease

## CRM simulation

```bash
bun test packages/workflow-engine/tests/crm-e2e.test.ts
```

Runs the reference CRM mission (`m-crm-ref`): bootstrap → plan merge → implementation DAG with auto-materialized `gate-merge-*` nodes → deploy → `verify-deployment` with FR-17 `verified` gate.

Optional healing test: `simulateBrowserFailure: true` on `runCrmMission()` exercises `FAILED → healing → SUCCESS`.

## Storage

Default: in-memory SQLite (`:memory:`). Set `WORKFLOW_DB_PATH` or pass `dbPath` to `WorkflowEngine` for file-backed state.

Optional Docker: `docker compose up workflow-engine` runs tests with a persisted volume at `./data/workflow.db`.

## Docs

- [cli-reference.md](../../docs/cli-reference.md) — `asf` CLI (server, mission, agent run)
- [agent-runtime.md](../../docs/agent-runtime.md) — spawn sequence, sandbox, heartbeat
- [workflow-dsl.md](../../docs/workflow-dsl.md)
- [ADD.md](../../docs/ADD.md)
- [reference-crm-mission.md](../../requirements/fixtures/reference-crm-mission.md)
- [local-operator-mission.yaml](../../requirements/fixtures/local-operator-mission.yaml) — CLI create fixture
