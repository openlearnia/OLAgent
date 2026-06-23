# ASF Workflow DSL Specification

**Version:** 1.0.0  
**Status:** Authoritative  
**Date:** 2026-06-22  
**Owner:** Workflow Engine (sole writer of `TaskExecution` status)

This specification defines the workflow graph language, state machine, event catalog, and engine APIs promised in `requirements/README.md`.

---

## 1. Overview

The Workflow DSL describes a mission's work as a **directed graph** of nodes connected by typed edges. The Workflow Engine:

1. Parses planner output (`tasks/plan.json`) and seed bootstrap tasks into a graph.
2. Evaluates eligibility from edge semantics and task status.
3. Transitions `TaskExecution` records per the state table below.
4. Emits events for continuation, UI, and audit.

**Non-goal:** This is not a general-purpose programming language. Control flow is limited to DAG + healing-child subgraphs + gate nodes.

---

## 2. Document Model

### 2.1 Workflow Document

```yaml
workflow:
  version: "1.0"
  missionId: "m-7f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c"
  metadata:
    plannerTaskId: "t-plan"
    createdAt: "2026-06-22T09:00:00Z"
  nodes: [...]
  edges: [...]
```

### 2.2 Node

```yaml
nodes:
  - id: "t-contacts-api"
    kind: task                    # task | healing-child | gate
    type: implement-backend       # FR-05 task type
    assignedAgentType: backend-engineer
    title: "Implement /api/contacts CRUD"
    description: "..."
    acceptanceCriteria:
      - "OpenAPI contract satisfied"
    parallelSafe: false
    maxRetries: 3
    epicId: "epic-contacts"
    metadata: {}
```

### 2.3 Edge

```yaml
edges:
  - from: "t-schema"
    to: "t-contacts-api"
    kind: hard                    # hard | soft
```

---

## 3. Node Types

### 3.1 `task`

Standard executable unit. Maps 1:1 to a `Task` row and spawns an ACP session when scheduled.

**Bootstrap task types** (seed DAG):

| `type` | `assignedAgentType` | Output Artifact |
|--------|---------------------|-----------------|
| `discover-requirements` | requirement-discovery | `requirements.md` |
| `research` | research | `research-report.md` |
| `architecture` | architect | `architecture.md`, `database-schema.md`, `openapi.yaml` |
| `plan-tasks` | planner | `tasks/plan.json`, `planning-report.md` |

**Implementation task types** (planner-emitted): see FR-05.

### 3.2 `healing-child`

Meta-node that expands into a **child subgraph** when parent task fails with `recoverable: true`.

```yaml
nodes:
  - id: "healing-t-test-contacts"
    kind: healing-child
    parentTaskId: "t-test-contacts"
    maxIterations: 3          # FR-15; inherits parent maxRetries if unset
    children:
      - id: "healing-t-test-contacts-fix-1"
        type: heal-analyze-fix
        assignedAgentType: fix
      - id: "healing-t-test-contacts-retest-1"
        type: heal-retest
        assignedAgentType: testing
    edges:
      - { from: "healing-t-test-contacts-fix-1", to: "healing-t-test-contacts-retest-1", kind: hard }
```

**Expansion rules:**

1. **Single healing ingress:** `completeTask` with `needsHealing: true` (or `FAILED` + `recoverable: true`) is the **canonical** trigger. Engine materializes child task rows and emits `failure.detected` for audit only — it does **not** spawn a second healing subgraph.
2. Healing dedup idempotency key: `heal:{taskExecutionId}:{failureReportId}`.
3. Children run sequentially (fix → retest).
4. Retest pass → parent latest `TaskExecution` → `SUCCESS` (`FAILED → SUCCESS` transition).
5. Retest fail → increment iteration; if `< maxIterations`, schedule new fix child pair with incremented suffix (respect `nextEligibleAt` backoff).
6. Exhausted → parent → `BLOCKED` or `FAILED` per [§5.4](#54-blocked-vs-failed-on-exhaustion-fr-15).

Healing children are **not** in the initial planner DAG; they are engine-generated from `healing-child` templates per FR-14.

### 3.3 `gate`

Non-agent synchronization node. Gates **do not** spawn ACP sessions; the engine runs gate logic or delegates to a lightweight runner.

| `gateType` | Trigger | Pass Condition |
|------------|---------|----------------|
| `merge` | Parent task SUCCESS | `task/{id}` merged to `mission/{id}`; secret-scan pass |
| `test` | Pre-merge or phase boundary | `bun test` exit 0 |
| `deploy` | All impl + test tasks SUCCESS | Deployment report `status: deployed` |
| `verify` | Deploy gate SUCCESS | FR-17 report `status: verified` |

```yaml
nodes:
  - id: "gate-merge-t-contacts-api"
    kind: gate
    gateType: merge
    parentTaskId: "t-contacts-api"
    checks:
      - command: bun test
      - command: secret-scan
```

`verify-deployment` **task** (type `verify-deployment`, agent `verification`) is preferred over a pure gate for FR-17 — it produces artifacts and uses browser MCP. The `verify` gate type is an alias for engine checks when no agent is needed (dry-run only).

---

## 4. Edge Types

| Kind | Semantics | Scheduling |
|------|-----------|------------|
| `hard` | All upstream nodes' latest execution MUST be `SUCCESS` | Blocks until satisfied |
| `soft` | Upstream SHOULD complete first; downstream may enter `WAITING` | Engine may pre-warm context but not `RUNNING` until hard deps met |

**v1 default:** All planner dependencies are `hard`. Soft edges reserved for optional research branches (future).

**Cycle detection:** Planner MUST reject cycles; engine rejects merge if `plan.json` contains cycle.

---

## 4.1 Planner Merge Semantics

When `plan-tasks` completes, the engine ingests `tasks/plan.json` (schema: [`requirements/schemas/tasks-plan.v1.json`](../requirements/schemas/tasks-plan.v1.json)).

**Merge algorithm (v1, additive only):**

1. Validate `plan.json` against schema; reject cycles and unknown task types.
2. For each task in `plan.tasks`:
   - **New `id`** → insert `Task` row + `PENDING` `TaskExecution` (attempt=1); add node + hard edges from `dependencies`.
   - **Collision (same `id`)** → reject merge with `PLAN_COLLISION` unless mission amendment flag set (v1: always reject).
3. Wire `t-plan` SUCCESS → hard edge to root implementation tasks (those with no deps or deps satisfied only by bootstrap).
4. **Gate auto-materialization:** For each implementation `task` node, engine inserts a sibling `gate-merge-{taskId}` node:
   - `kind: gate`, `gateType: merge`, `parentTaskId: {taskId}`
   - Hard edge: `{taskId} → gate-merge-{taskId}`
   - Downstream tasks depend on `gate-merge-{taskId}` SUCCESS, not raw task SUCCESS (merge is part of completion).
5. Persist merged DAG; emit `mission.progress`; call `scheduleTasks`.

Re-plan during execution is not supported in v1 (see ADD OD-6).

---

## 5. State Transition Table (Authoritative)

**Sole writer:** Workflow Engine mutates `TaskExecution.status`. Agents report outcomes; they never set status directly.

### 5.1 TaskExecution States

`PENDING` | `RUNNING` | `WAITING` | `BLOCKED` | `FAILED` | `SUCCESS`

### 5.2 Transitions

| From | Event / Condition | To | Side Effects |
|------|-------------------|-----|--------------|
| — | `task.created` | `PENDING` | Insert Task + TaskExecution attempt=1 |
| `PENDING` | `scheduleTasks` + deps satisfied + concurrency ok | `RUNNING` | Assign agent, set lease, spawn ACP |
| `PENDING` | soft dep unmet | `WAITING` | — |
| `WAITING` | hard deps satisfied | `PENDING` | Eligible for scheduling |
| `RUNNING` | `completeTask` + result COMPLETED | `SUCCESS` | Emit `task.completed`, enqueue merge gate |
| `RUNNING` | `completeTask` + result FAILED + non-recoverable | `BLOCKED` | Emit `task.blocked` |
| `RUNNING` | `completeTask` + result FAILED + recoverable | `FAILED` | Emit `task.failed`, spawn healing-child (dedup `heal:{te}:{failId}`) |
| `RUNNING` | lease expired | `FAILED` | `classification: timeout`, recoverable |
| `FAILED` | retries remain + healing scheduled | `PENDING` | New attempt row or healing child; set `nextEligibleAt` per backoff |
| `FAILED` | healing retest pass | `SUCCESS` | Parent task healed; emit `healing.iteration.completed` outcome=healed |
| `FAILED` | retries exhausted | `BLOCKED` or `FAILED` | Per §5.4 |
| `SUCCESS` | — | — | Terminal |
| `BLOCKED` | operator `reset` / admin action | `PENDING` | Audit log |
| `BLOCKED` | — | — | Terminal until admin |

**Invalid transitions** (engine MUST reject with `INVALID_TRANSITION`):

- `SUCCESS → RUNNING`
- `BLOCKED → RUNNING` (without admin reset)
- Any transition not listed above

### 5.4 BLOCKED vs FAILED on Exhaustion (FR-15)

| Condition | Parent `TaskExecution` | Mission (if critical path) |
|-----------|------------------------|----------------------------|
| `recoverable: true`, retries exhausted, human action needed | `BLOCKED` | `BLOCKED` |
| `recoverable: false` (e.g., planning error, policy violation) | `FAILED` | `FAILED` |
| Non-critical path task exhausted | `BLOCKED` | `RUNNING` (other branches continue) |
| Healing retest pass after prior `FAILED` | `SUCCESS` | unchanged until all tasks terminal |

Backoff between healing iterations (mission `constraints.retryBackoffMs`, default `[0, 30000, 120000]`): engine sets `TaskExecution.nextEligibleAt`; `scheduleTasks` MUST NOT promote task until `now >= nextEligibleAt`.

### 5.5 Eligibility Semantics

`getEligibleTasks(missionId)` evaluates **`latestTaskExecution(taskId).status`** for each task — not the `Task` specification row. Gate nodes use the same rule. UI `Task.status` is a projection of latest execution.

### 5.6 Agent Lifecycle (Separate Record)

Agent status is tracked on `Agent` rows for UI/telemetry. Engine correlates `Agent COMPLETED` → `completeTask` call.

---

## 6. Event Catalog

All events are persisted to `workflow_events` with `idempotencyKey`. JSON Schema: [`requirements/schemas/events/workflow-event.v1.json`](../requirements/schemas/events/workflow-event.v1.json).

### 6.1 `mission.created`

```json
{
  "$schema": "../requirements/schemas/events/workflow-event.v1.json",
  "type": "mission.created",
  "missionId": "m-uuid",
  "goal": "Build a CRM for small businesses",
  "constraints": {},
  "timestamp": "2026-06-22T09:00:00Z"
}
```

### 6.2 `mission.started`

```json
{
  "type": "mission.started",
  "missionId": "m-uuid",
  "seedTasks": ["t-discover", "t-research", "t-architecture", "t-plan"],
  "timestamp": "2026-06-22T09:00:01Z"
}
```

### 6.3 `task.scheduled`

```json
{
  "type": "task.scheduled",
  "missionId": "m-uuid",
  "tasks": [
    {
      "taskId": "t-contacts-api",
      "taskExecutionId": "te-uuid",
      "agentType": "backend-engineer",
      "attempt": 1
    }
  ],
  "reason": "t-schema.completed",
  "idempotencyKey": "schedule:m-uuid:evt-uuid",
  "timestamp": "2026-06-22T10:00:01Z"
}
```

### 6.4 `task.started`

```json
{
  "type": "task.started",
  "missionId": "m-uuid",
  "taskId": "t-contacts-api",
  "taskExecutionId": "te-uuid",
  "agentId": "a-uuid",
  "acpSessionId": "acp-uuid",
  "timestamp": "2026-06-22T10:00:05Z"
}
```

### 6.5 `task.completed`

```json
{
  "type": "task.completed",
  "missionId": "m-uuid",
  "taskId": "t-contacts-api",
  "taskExecutionId": "te-uuid",
  "status": "SUCCESS",
  "artifacts": ["packages/api/src/routes/contacts.ts"],
  "commits": ["abc1234"],
  "summary": "Implemented CRUD endpoints",
  "idempotencyKey": "complete:te-uuid:hash",
  "timestamp": "2026-06-22T10:45:00Z"
}
```

### 6.6 `task.failed`

```json
{
  "type": "task.failed",
  "missionId": "m-uuid",
  "taskId": "t-test-contacts",
  "taskExecutionId": "te-uuid",
  "failureReportId": "fail-uuid",
  "classification": "assertion_failure",
  "recoverable": true,
  "retryCount": 1,
  "maxRetries": 3,
  "timestamp": "2026-06-22T11:00:00Z"
}
```

### 6.7 `task.blocked`

```json
{
  "type": "task.blocked",
  "missionId": "m-uuid",
  "taskId": "t-test-contacts",
  "reason": "retries_exhausted",
  "message": "Assertion failure after 3 healing iterations",
  "suggestedActions": ["Review failure report", "Reset retries", "Manual fix"],
  "timestamp": "2026-06-22T11:30:00Z"
}
```

### 6.8 `failure.detected`

Emitted by Agent Runtime / failure detector (FR-13) for **audit and UI only**. Healing is triggered exclusively via `completeTask` (§3.2). Engine MUST NOT spawn a second healing subgraph on this event.

```json
{
  "type": "failure.detected",
  "missionId": "m-uuid",
  "taskId": "t-test-contacts",
  "taskExecutionId": "te-uuid",
  "domain": "test",
  "classification": "assertion_failure",
  "message": "Expected 200, received 404",
  "recoverable": true,
  "reportPath": "artifacts/failure-reports/t-test-contacts.json",
  "timestamp": "2026-06-22T11:00:00Z"
}
```

### 6.9 `healing.iteration.started`

```json
{
  "type": "healing.iteration.started",
  "missionId": "m-uuid",
  "parentTaskId": "t-test-contacts",
  "iteration": 2,
  "maxIterations": 3,
  "childTaskIds": ["healing-t-test-contacts-fix-2", "healing-t-test-contacts-retest-2"],
  "timestamp": "2026-06-22T11:05:00Z"
}
```

### 6.10 `healing.iteration.completed`

```json
{
  "type": "healing.iteration.completed",
  "missionId": "m-uuid",
  "parentTaskId": "t-test-contacts",
  "iteration": 2,
  "outcome": "healed",
  "fixCommit": "def5678",
  "retestResult": "pass",
  "timestamp": "2026-06-22T11:20:00Z"
}
```

### 6.11 `gate.started` / `gate.completed` / `gate.failed`

```json
{
  "type": "gate.completed",
  "missionId": "m-uuid",
  "gateId": "gate-merge-t-contacts-api",
  "gateType": "merge",
  "parentTaskId": "t-contacts-api",
  "mergeCommit": "merged-sha",
  "timestamp": "2026-06-22T10:50:00Z"
}
```

### 6.12 `mission.progress`

```json
{
  "type": "mission.progress",
  "missionId": "m-uuid",
  "completed": 8,
  "total": 15,
  "percent": 53,
  "timestamp": "2026-06-22T10:45:01Z"
}
```

### 6.13 `mission.completed`

```json
{
  "type": "mission.completed",
  "missionId": "m-uuid",
  "status": "SUCCESS",
  "verificationReportPath": "artifacts/verification/m-uuid.json",
  "timestamp": "2026-06-22T18:00:00Z"
}
```

### 6.14 `orchestrator.recovered`

```json
{
  "type": "orchestrator.recovered",
  "orphanedTasks": [
    { "taskId": "t-ui", "taskExecutionId": "te-uuid", "action": "FAILED_TIMEOUT" }
  ],
  "rescheduledMissions": ["m-uuid"],
  "timestamp": "2026-06-22T12:00:00Z"
}
```

---

## 7. Engine APIs

### 7.1 `completeTask`

**Endpoint:** `POST /internal/v1/tasks/:taskExecutionId/complete`

**Request:**

```json
{
  "idempotencyKey": "complete:te-uuid:sha256-of-result",
  "agentId": "a-uuid",
  "result": {
    "status": "COMPLETED",
    "artifacts": ["path/to/file"],
    "commits": ["abc1234"],
    "summary": "Done",
    "needsHealing": false
  }
}
```

**`AgentResult` with healing signal:**

```json
{
  "status": "FAILED",
  "artifacts": [],
  "commits": [],
  "summary": "Tests failed",
  "needsHealing": true,
  "error": {
    "code": "TEST_FAILURE",
    "message": "3 assertions failed",
    "recoverable": true,
    "classification": "assertion_failure"
  }
}
```

**Response (200):**

```json
{
  "taskExecutionId": "te-uuid",
  "newStatus": "SUCCESS",
  "duplicate": false,
  "continuation": {
    "scheduledTasks": ["t-deals-api"],
    "missionStatus": "RUNNING"
  }
}
```

**Idempotency:** Same `idempotencyKey` returns prior response with `duplicate: true`. No double continuation.

**Errors:**

| Code | Meaning |
|------|---------|
| `INVALID_TRANSITION` | e.g., complete on SUCCESS |
| `LEASE_EXPIRED` | execution already timed out |
| `IDEMPOTENCY_CONFLICT` | same key, different payload |

### 7.2 `scheduleTasks`

**Endpoint:** `POST /internal/v1/schedule`

**Request:**

```json
{
  "missionId": "m-uuid",
  "trigger": "task.completed",
  "triggerEventId": "evt-uuid",
  "idempotencyKey": "schedule:m-uuid:evt-uuid",
  "force": false
}
```

**Response:**

```json
{
  "scheduled": [
    { "taskId": "t-contacts-api", "taskExecutionId": "te-new", "agentType": "backend-engineer" }
  ],
  "eligibleButDeferred": [
    { "taskId": "t-openapi-touch", "reason": "shared_surface_serialization" }
  ],
  "missionStatus": "RUNNING"
}
```

**Behavior:**

1. Compute `getEligibleTasks(missionId)` using `latestTaskExecution(taskId).status` (§5.5).
2. Filter tasks where `nextEligibleAt` is null or `now >= nextEligibleAt` (FR-15 backoff).
3. Filter out tasks already `RUNNING`.
4. Apply per-agent concurrency limits.
5. Apply shared-surface serialization (FR-05).
6. Transition selected tasks `PENDING → RUNNING`.
7. Emit `task.scheduled`.

### 7.3 `heartbeat`

**Endpoint:** `POST /internal/v1/tasks/:taskExecutionId/heartbeat`

```json
{
  "agentId": "a-uuid",
  "acpSessionId": "acp-uuid",
  "extendBySeconds": 120
}
```

---

## 8. DSL → FR-05 Task Types → FR-07 Agent Types

| DSL `type` | FR-05 | FR-07 `assignedAgentType` |
|------------|-------|---------------------------|
| `discover-requirements` | *(bootstrap)* | `requirement-discovery` |
| `research` | *(bootstrap)* | `research` |
| `architecture` | *(bootstrap)* | `architect` |
| `plan-tasks` | *(bootstrap)* | `planner` |
| `setup-repo` | ✅ | `infra-engineer` |
| `schema-migration` | ✅ | `backend-engineer` |
| `implement-backend` | ✅ | `backend-engineer` |
| `implement-frontend` | ✅ | `frontend-engineer` |
| `implement-infra` | ✅ | `infra-engineer` |
| `write-tests` | ✅ | `testing` |
| `browser-test` | ✅ | `testing` |
| `deploy` | ✅ | `deployment` |
| `verify-deployment` | ✅ | `verification` |
| `heal-analyze-fix` | *(engine)* | `fix` |
| `heal-retest` | *(engine)* | `testing` |

---

## 9. Example: Reference CRM Mission Workflow

Full mission: [reference-crm-mission.md](../requirements/fixtures/reference-crm-mission.md)

```yaml
workflow:
  version: "1.0"
  missionId: "m-crm-ref"
  metadata:
    fixture: reference-crm-mission
  nodes:
    # --- Bootstrap (seed) ---
    - id: t-discover
      kind: task
      type: discover-requirements
      assignedAgentType: requirement-discovery
      title: Discover CRM requirements

    - id: t-research
      kind: task
      type: research
      assignedAgentType: research
      title: Research CRM domain patterns

    - id: t-architecture
      kind: task
      type: architecture
      assignedAgentType: architect
      title: Design CRM architecture

    - id: t-plan
      kind: task
      type: plan-tasks
      assignedAgentType: planner
      title: Decompose into executable tasks

    # --- Implementation (planner-emitted excerpt) ---
    - id: t-setup
      kind: task
      type: setup-repo
      assignedAgentType: infra-engineer
      title: Initialize Bun monorepo
      parallelSafe: false

    - id: t-schema
      kind: task
      type: schema-migration
      assignedAgentType: backend-engineer
      title: Create D1 schema

    - id: t-contacts-api
      kind: task
      type: implement-backend
      assignedAgentType: backend-engineer
      title: Implement /api/contacts CRUD
      parallelSafe: false

    - id: gate-merge-t-contacts-api
      kind: gate
      gateType: merge
      parentTaskId: t-contacts-api
      checks:
        - command: bun test
        - command: secret-scan

    - id: t-contacts-ui
      kind: task
      type: implement-frontend
      assignedAgentType: frontend-engineer
      title: Implement contacts UI

    - id: gate-merge-t-contacts-ui
      kind: gate
      gateType: merge
      parentTaskId: t-contacts-ui

    - id: t-tests
      kind: task
      type: write-tests
      assignedAgentType: testing
      title: Unit and integration tests

    - id: t-browser
      kind: task
      type: browser-test
      assignedAgentType: testing
      title: Browser E2E tests

    - id: t-deploy
      kind: task
      type: deploy
      assignedAgentType: deployment
      title: Deploy to Cloudflare staging

    - id: t-verify
      kind: task
      type: verify-deployment
      assignedAgentType: verification
      title: Verify staging deployment (FR-17)

    # --- Healing template (engine-materialized) ---
    - id: healing-t-browser
      kind: healing-child
      parentTaskId: t-browser
      maxIterations: 3

  edges:
    # Bootstrap chain
    - { from: t-discover, to: t-research, kind: hard }
    - { from: t-research, to: t-architecture, kind: hard }
    - { from: t-architecture, to: t-plan, kind: hard }
    - { from: t-plan, to: t-setup, kind: hard }

    # Implementation
    - { from: t-setup, to: t-schema, kind: hard }
    - { from: t-schema, to: t-contacts-api, kind: hard }
    - { from: t-schema, to: t-contacts-ui, kind: hard }
    - { from: t-contacts-api, to: gate-merge-t-contacts-api, kind: hard }
    - { from: t-contacts-ui, to: gate-merge-t-contacts-ui, kind: hard }
    - { from: gate-merge-t-contacts-api, to: t-tests, kind: hard }
    - { from: gate-merge-t-contacts-ui, to: t-tests, kind: hard }
    - { from: t-tests, to: t-browser, kind: hard }
    - { from: t-browser, to: t-deploy, kind: hard }
    - { from: t-deploy, to: t-verify, kind: hard }
```

**Mission SUCCESS precondition:** `t-verify` latest execution `SUCCESS` AND `artifacts/verification/m-crm-ref.json` has `"status": "verified"`.

---

## 10. Continuation Algorithm (Normative)

```
on event(task.completed | healing.iteration.completed | gate.completed):
  if mission.paused: return
  if not idempotent(event): return prior result

  eligible = getEligibleTasks(missionId)  # latestTaskExecution per §5.5
  eligible = filter nextEligibleAt <= now   # FR-15 backoff
  eligible = filter concurrency limits
  eligible = applySharedSurfaceSerialization(eligible)

  for task in eligible:
    transition PENDING → RUNNING
    spawn agent

  if no RUNNING and no eligible:
    if all SUCCESS and verify verified: mission → SUCCESS
    elif any BLOCKED: mission → BLOCKED
    elif any FAILED exhausted: mission → FAILED

  emit mission.progress
```

---

## Related Documents

- [ADD.md](./ADD.md)
- [agent-contracts.md](./agent-contracts.md)
- [reviews/cross-review-synthesis.md](./reviews/cross-review-synthesis.md)
- [requirements/framework/workflow-engine.md](../requirements/framework/workflow-engine.md)
- [requirements/schemas/](../requirements/schemas/)
