# FR-20 — Autonomous Continuation

## Summary

When a task completes successfully, ASF must automatically identify and start the next eligible task(s) without human intervention — driving continuous progress until the mission reaches a terminal state.

## User Story

> As a user, I want ASF to keep working through my entire project automatically — I shouldn't have to click "run next task" after each step completes.

## System Story

> As the Autonomous Continuation engine, I must listen for task completion events, re-evaluate the dependency graph, schedule all newly eligible tasks, and repeat until no eligible tasks remain (mission complete or blocked).

## Requirements

1. On task `SUCCESS`, the system MUST within 2 seconds:
   - Re-evaluate dependency graph (FR-06)
   - Identify all newly eligible tasks
   - Enqueue eligible tasks for agent assignment (FR-07)
2. Multiple eligible tasks MUST be scheduled in parallel subject to concurrency limits.
3. Continuation MUST handle phase transitions automatically:
   - Discovery complete → Architecture
   - Planning complete → Implementation tasks
   - All implementation + tests complete → Deployment
   - Deployment complete → `verify-deployment` task (FR-17)
4. Continuation MUST NOT start tasks whose dependencies are not `SUCCESS`.
5. When no eligible tasks remain and no tasks are `RUNNING`:
   - All tasks `SUCCESS` **and** `verify-deployment` task `SUCCESS` with FR-17 report `status: verified` → Mission `SUCCESS`
   - Any task `BLOCKED` → Mission `BLOCKED`
   - Any task `FAILED` (retries exhausted) → Mission `FAILED`
6. Verification MUST be modeled as an explicit `verify-deployment` task in the planner output (FR-05); continuation MUST NOT infer mission `SUCCESS` from deploy task completion alone.
7. Continuation MUST be durable — if orchestrator restarts mid-mission, eligible tasks resume automatically.
8. Task completion events MUST be idempotent — duplicate events MUST NOT double-schedule.
9. Continuation MUST respect mission-level pause flag (admin can pause autonomous progression).
10. Progress events MUST be emitted: `mission.progress` with `{ completed, total, percent }`.
11. Continuation loop MUST terminate — no infinite scheduling on empty eligible set.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | `task.completed` events | `{ taskId, status, missionId }` |
| Input | Dependency graph state (FR-06) | Graph |
| Input | Concurrency config | Per agent type limits |
| Output | `task.scheduled` events | Task assignments |
| Output | Mission status transitions | Workflow state |
| Output | Progress metrics | Percent complete |

## Acceptance Criteria

- [ ] CRM mission progresses from setup → schema → API → UI → tests → deploy → verify without manual triggers
- [ ] Parallel UI and API tasks start when schema task completes
- [ ] Mission marked `SUCCESS` only after verification (FR-17)
- [ ] Orchestrator restart resumes scheduling of eligible tasks
- [ ] Duplicate completion event does not create duplicate agent assignments
- [ ] Paused mission does not schedule new tasks
- [ ] Progress percentage updates in UI after each task completion

## Dependencies

- FR-06 — Eligibility computation
- FR-07 — Agent scheduling
- [framework/workflow-engine.md](../framework/workflow-engine.md)
- FR-17 — Terminal success gate
- FR-15 — Blocked/failed terminal states

## Non-Goals

- Priority-based preemption of running tasks
- User confirmation between phases (v1)
- Cross-mission task scheduling

## Open Questions

1. Notification to user on phase transitions?
2. Maximum parallel tasks per mission?
3. Continuation across calendar days with rate limits?

## Examples

**Continuation event flow:**

```
task.completed { taskId: t-schema, status: SUCCESS }
  → getEligibleTasks() → [t-contacts-api, t-deals-api]
  → schedule t-contacts-api (backend-engineer)
  → schedule t-deals-api (backend-engineer)
  → emit mission.progress { completed: 3, total: 15, percent: 20 }
```

**Mission completion check:**

```yaml
continuation:
  mission_id: m-7f3a2b1c
  running: 0
  eligible: 0
  pending: 0
  blocked: 0
  failed: 0
  success: 15
  action: set_mission_status(SUCCESS)
  precondition: verification.status == verified
```

**Pause behavior:**

```json
{
  "missionId": "m-7f3a2b1c",
  "paused": true,
  "effect": "Completion events logged but no new tasks scheduled until resumed"
}
```
