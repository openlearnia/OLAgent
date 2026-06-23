# FR-06 — Dependency Management

## Summary

ASF must construct and maintain a task dependency graph (DAG) from planner output, resolve execution order, detect cycles, and expose dependency state to the Workflow Engine for scheduling decisions.

## User Story

> As the ASF platform, I need tasks executed in the correct order — and independent tasks in parallel — so that agents never implement features before their prerequisites exist.

## System Story

> As the Dependency Manager, I must ingest task definitions, build a directed acyclic graph, validate integrity, update edges on replanning, and answer queries: eligible tasks, blocked tasks, critical path.

## Requirements

1. The system MUST build a DAG from `tasks/plan.json` (FR-05) at planning completion.
2. Each task MUST declare zero or more `dependencies` (task IDs).
3. A task is **eligible** for scheduling when:
   - Status is `PENDING`
   - All dependency tasks have status `SUCCESS`
4. The system MUST reject cyclic dependencies at graph construction with error `DEPENDENCY_CYCLE_DETECTED` citing the cycle path.
5. The system MUST support parallel scheduling of tasks with no mutual dependencies.
6. The system MUST expose APIs:
   - `getEligibleTasks(missionId)` → task IDs ready to run
   - `getBlockedTasks(missionId)` → tasks waiting on incomplete dependencies
   - `getCriticalPath(missionId)` → longest dependency chain
7. On task status change to `SUCCESS`, the system MUST re-evaluate eligibility of dependent tasks within 1 second.
8. Soft dependencies (optional `softDependencies`) MAY be supported for ordering hints without hard blocking.
9. Dependency graph MUST be persisted durably and recoverable after restart.
10. Graph mutations (add/remove edges) MUST be audit-logged.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | `tasks/plan.json` | JSON |
| Input | Task status updates | Events from Workflow Engine |
| Output | Dependency graph | DB / in-memory with persistence |
| Output | Eligibility queries | API responses |

## Acceptance Criteria

- [ ] CRM mission DAG has no cycles
- [ ] `t-contacts-api` not eligible until `t-schema` is `SUCCESS`
- [ ] Parallel tasks (e.g., independent UI components) scheduled concurrently
- [ ] Injected cycle in test plan rejected with clear error
- [ ] Critical path computation matches longest chain in test fixture
- [ ] Graph state survives orchestrator restart

## Dependencies

- FR-05 — Planner output
- [framework/workflow-engine.md](../framework/workflow-engine.md) — Scheduling consumer
- FR-20 — Continuation uses eligibility
- [01-core-concepts.md](../01-core-concepts.md)

## Non-Goals

- Cross-mission dependencies
- Resource-based dependencies (e.g., "wait for GPU")
- Conditional dependencies based on runtime outcomes (v1)

## Open Questions

1. Should failed dependencies block dependents permanently or allow skip with flag?
2. Visual DAG editor in UI?
3. Maximum graph size limits?

## Examples

**Dependency graph (adjacency list):**

```yaml
dependency_graph:
  mission_id: m-7f3a2b1c-...
  edges:
    - from: t-setup
      to: t-schema
    - from: t-schema
      to: t-contacts-api
    - from: t-schema
      to: t-deals-api
    - from: t-contacts-api
      to: t-contacts-ui
    - from: t-contacts-api
      to: t-integration-tests
```

**Cycle detection error:**

```json
{
  "error": "DEPENDENCY_CYCLE_DETECTED",
  "cycle": ["t-a", "t-b", "t-c", "t-a"]
}
```
