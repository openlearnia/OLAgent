# ASF-FW-05 — User Interface

## Summary

ASF provides a web-based operator interface with three primary views — Mission Dashboard, Task View, and Agent View — enabling users to monitor autonomous progress, inspect failures, and intervene when missions are blocked.

## User Story

> As a user who started a mission, I want a clear dashboard showing progress, current activity, and any problems so that I trust ASF is working and know when I need to step in.

## System Story

> As the ASF UI, I must consume mission, task, agent, and metrics APIs to render real-time status, support drill-down into details, and provide limited intervention controls (pause, resume, re-verify).

## Views

### 1. Mission Dashboard

Primary landing view for a mission.

**Sections:**
- **Header:** Mission goal, status badge, completion percentage, elapsed time
- **Checklist:** Vision output checklist (requirements ✓, architecture ✓, tests ✓, deployed ✓, verified ✓)
- **Progress bar:** Task completion (FR-20 progress events)
- **Activity feed:** Recent events (task completed, agent started, failure detected, healing attempt)
- **Metrics summary:** Token usage, estimated cost, success rate (framework/monitoring.md)
- **Blocked alert:** Prominent banner when mission `BLOCKED` with suggested actions (FR-15)

**Actions:**
- Pause / Resume mission
- Re-verify deployment (FR-17)
- View workspace files (read-only)
- Export mission report

### 2. Task View

Detailed task list and workflow visualization.

**Sections:**
- **Workflow graph:** DAG visualization with task nodes colored by state
- **Task table:** ID, title, type, status, agent type, duration, retries
- **Task detail panel:** Description, acceptance criteria, artifacts, failure reports, healing log
- **Dependency view:** Upstream/downstream tasks for selected task

**Actions:**
- Filter by status, agent type, epic
- Click task → detail panel
- Admin: reset retries, force-skip (audit logged)

### 3. Agent View

Agent execution monitoring.

**Sections:**
- **Active agents:** Currently running agents with task, type, duration, token count
- **Agent history:** Completed/failed executions with summary
- **Session detail:** Tool call log, LLM turn count, artifact list
- **Agent type breakdown:** Success rate and avg duration per type

**Actions:**
- Click agent → session telemetry detail
- View tool call audit log (framework/mcp-integration.md)

## Requirements

1. UI MUST be a web application accessible via browser (no desktop app required v1).
2. UI MUST update in near-real-time (< 5s latency) on state changes.
3. Mission Dashboard MUST be the default view after mission creation (FR-01).
4. All three views MUST be navigable from a persistent sidebar/tab bar.
5. Status colors MUST be consistent:
   - `SUCCESS` / `COMPLETED` — green
   - `RUNNING` — blue
   - `PENDING` / `WAITING` — gray
   - `FAILED` — red
   - `BLOCKED` — orange/amber
6. Blocked missions MUST show: task name, failure message, retry count, healing log link, suggested actions.
7. Workflow graph MUST render task DAG from workflow engine data.
8. UI MUST be read-only for code/workspace — no inline editing (v1).
9. UI MUST support at least one active mission view; mission list page for multiple missions.
10. Responsive layout SHOULD work on tablet+ viewports (mobile not required v1).

## Inputs / Outputs / Artifacts

| Direction | Name | Source |
|-----------|------|--------|
| Input | Mission API | `/api/v1/missions/{id}` |
| Input | Tasks API | `/api/v1/missions/{id}/tasks` |
| Input | Agents API | `/api/v1/missions/{id}/agents` |
| Input | Metrics API | `/api/v1/missions/{id}/metrics` |
| Input | Events stream | WebSocket/SSE |
| Output | User actions | Pause, resume, re-verify, admin overrides |

## Acceptance Criteria

- [ ] Mission Dashboard shows CRM mission progress updating in real-time
- [ ] Checklist items check off as phases complete
- [ ] Task View renders workflow DAG with correct state colors
- [ ] Clicking failed task shows failure report and healing log
- [ ] Agent View shows live token count during execution
- [ ] Blocked mission displays actionable alert with suggested steps
- [ ] Pause button stops new task scheduling (FR-20)
- [ ] Re-verify triggers FR-17 and updates checklist

## Dependencies

- FR-01 — Mission creation triggers UI
- FR-15 — Blocked state display
- FR-17 — Re-verify action
- FR-20 — Progress events
- [framework/monitoring.md](./monitoring.md) — Metrics display
- [framework/workflow-engine.md](./workflow-engine.md) — Task states

## Non-Goals

- In-browser code editor (v1)
- Chat interface for mission goal input (API/CLI acceptable v1)
- Mobile-native app
- Multi-user real-time collaboration

## Open Questions

1. React + shadcn vs. other stack for UI?
2. Embedded workflow graph library (React Flow)?
3. Authentication for UI access (v1: local/single-user)?

## Examples

**Mission Dashboard wireframe (ASCII):**

```
┌─────────────────────────────────────────────────────────┐
│  Mission: Build a CRM for small businesses    RUNNING  │
│  ████████████░░░░░░░░  73% (11/15 tasks)   4h 12m     │
├─────────────────────────────────────────────────────────┤
│  ✓ Requirements   ✓ Architecture   ✓ Implementation    │
│  ○ Tests passing  ○ Deployed       ○ Verified          │
├─────────────────────────────────────────────────────────┤
│  Active: backend-engineer on "Implement deals API"     │
│  Tokens: 570K ($2.85)   Success rate: 92%             │
├─────────────────────────────────────────────────────────┤
│  Recent Activity                                        │
│  10:45  ✓ t-contacts-api completed (backend-engineer)  │
│  10:00  → t-deals-api started (backend-engineer)       │
│  09:30  ✓ t-contacts-ui completed (frontend-engineer)   │
└─────────────────────────────────────────────────────────┘
```

**Blocked alert component data:**

```json
{
  "variant": "blocked",
  "title": "Mission blocked — retries exhausted",
  "task": "Test contacts feature",
  "message": "Contact list empty after create",
  "retryCount": 3,
  "actions": [
    { "label": "View healing log", "href": "/missions/m-7f3a2b1c/tasks/t-test-contacts" },
    { "label": "Reset retries", "action": "admin.resetRetries", "requiresAdmin": true }
  ]
}
```
