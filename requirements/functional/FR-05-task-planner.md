# FR-05 — Task Planner

## Summary

The Task Planner converts requirements and architecture artifacts into a structured set of epics and executable tasks, each with type, description, and dependency hints, ready for the Workflow Engine to schedule.

## User Story

> As the ASF platform, I need requirements and architecture translated into concrete, schedulable work units so that specialized agents know exactly what to implement and in what order.

## System Story

> As the Task Planner agent, I must analyze `requirements.md`, `architecture.md`, `database-schema.md`, and `openapi.yaml`, decompose work into atomic tasks, assign agent types, estimate dependencies, and emit a task graph for FR-06 and the Workflow Engine.

## Requirements

1. The planner MUST run automatically after FR-04 completes.
2. The planner MUST read all architecture artifacts plus `requirements.md`.
3. Output MUST include:
   - Epic groupings (logical feature bundles)
   - Task list with: `id`, `type`, `title`, `description`, `assignedAgentType`, `estimatedDependencies`, `acceptanceCriteria`
4. Task types MUST map to supported agent types (FR-07):
   - `setup-repo`, `schema-migration`, `implement-backend`, `implement-frontend`, `implement-infra`, `write-tests`, `browser-test`, `deploy`, `verify-deployment`
5. The planner MUST emit a `verify-deployment` task after `deploy`, assigned to `verification` agent (FR-07), with acceptance criteria tied to FR-17 checks.
6. Tasks that modify shared repository surfaces (`package.json`, root app entry files, `openapi.yaml`) MUST be scheduled sequentially unless explicitly marked `parallelSafe: true` in `plan.json`. Default: `parallelSafe: false`.
7. Each task description MUST reference specific requirement IDs and artifact sections.
8. Tasks MUST be atomic per core concepts granularity rule (single ACP session).
9. The planner MUST emit a planning summary: `planning-report.md` with task count, critical path, parallelizable groups.
10. Planning output MUST be persisted to workflow store and `tasks/plan.json` in workspace.
11. The planner MUST NOT execute tasks — planning only.
12. Re-planning triggered only on explicit mission amendment or architecture revision (v1: not automatic).

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | `requirements.md` | Markdown |
| Input | `architecture.md`, `database-schema.md`, `openapi.yaml` | Design artifacts |
| Output | `tasks/plan.json` | JSON task graph |
| Output | `planning-report.md` | Markdown summary |
| Output | Workflow DB records | Task entities |

## Acceptance Criteria

- [ ] CRM mission produces ≥ 10 tasks covering schema, API, UI, tests, deploy
- [ ] Every REQ-F-* requirement covered by at least one task
- [ ] Each task has `assignedAgentType` from FR-07 registry
- [ ] `plan.json` validates against task schema
- [ ] `verify-deployment` task present after deploy task
- [ ] Shared-surface tasks default to sequential (`parallelSafe: false`)
- [ ] Critical path identified in `planning-report.md`
- [ ] Dependency Management (FR-06) can build DAG from planner output

## Dependencies

- FR-04 — Architecture artifacts
- FR-06 — Dependency graph construction
- FR-07 — Agent type registry
- [framework/workflow-engine.md](../framework/workflow-engine.md)
- [01-core-concepts.md](../01-core-concepts.md)

## Non-Goals

- Effort estimation in story points or hours
- Dynamic re-planning during execution (v1)
- Resource capacity planning across missions

## Open Questions

1. Should planner output include explicit test tasks or assume test agent auto-generates?
2. Maximum task count per mission?
3. Template-based planning for common app patterns?

## Examples

**`tasks/plan.json` excerpt:**

```json
{
  "missionId": "m-7f3a2b1c-...",
  "epics": [
    { "id": "epic-auth", "title": "Authentication" },
    { "id": "epic-contacts", "title": "Contact Management" }
  ],
  "tasks": [
    {
      "id": "t-setup",
      "epicId": null,
      "type": "setup-repo",
      "title": "Initialize Bun monorepo with API and web packages",
      "assignedAgentType": "infra-engineer",
      "dependencies": [],
      "acceptanceCriteria": [
        "bun install succeeds",
        "packages/api and packages/web exist"
      ]
    },
    {
      "id": "t-schema",
      "type": "schema-migration",
      "title": "Create D1 schema per database-schema.md",
      "assignedAgentType": "backend-engineer",
      "dependencies": ["t-setup"],
      "acceptanceCriteria": ["Migration applies cleanly to local D1"]
    },
    {
      "id": "t-contacts-api",
      "type": "implement-backend",
      "title": "Implement /api/contacts CRUD per openapi.yaml",
      "assignedAgentType": "backend-engineer",
      "dependencies": ["t-schema"],
      "parallelSafe": false,
      "acceptanceCriteria": ["OpenAPI contract satisfied", "Unit tests pass"]
    },
    {
      "id": "t-verify",
      "type": "verify-deployment",
      "title": "Verify staging deployment per FR-17",
      "assignedAgentType": "verification",
      "dependencies": ["t-deploy"],
      "acceptanceCriteria": ["All FR-17 checks passed", "Smoke data cleaned up"]
    }
  ]
}
```
