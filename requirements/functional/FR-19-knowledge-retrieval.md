# FR-19 — Knowledge Retrieval

## Summary

Before executing a task, agents must retrieve relevant context from long-term memory and mission artifacts — requirements, decisions, prior failures, and dependency outputs — assembled into a bounded context bundle optimized for the agent type and task.

## User Story

> As an implementation agent, I need the right background information before I start coding so that I don't miss requirements or repeat mistakes from earlier attempts.

## System Story

> As the Knowledge Retrieval service, I must query memory and artifacts given a task assignment, rank and filter results, assemble a context bundle within token budget, and inject it into the ACP session (FR-08).

## Requirements

1. Retrieval MUST be invoked automatically before every agent execution (FR-07).
2. Retrieval inputs:
   - `missionId`, `taskId`, `agentType`
   - Task description and acceptance criteria
   - Dependency task artifact paths
3. Retrieval sources (priority order):
   - Dependency task output artifacts (files)
   - Semantic memory search (FR-18) using task description as query
   - Mission constraints and goal
   - Prior failure/healing reports for same task (on retry)
4. Context bundle MUST respect token budget (default: 32K tokens; configurable per agent type).
5. Bundle structure:

```json
{
  "contextId": "ctx-uuid",
  "mission": { "goal": "...", "constraints": {} },
  "task": { "id": "...", "description": "...", "acceptanceCriteria": [] },
  "artifacts": [{ "path": "openapi.yaml", "excerpt": "..." }],
  "memory": [{ "kind": "decision", "content": "...", "relevance": 0.92 }],
  "priorFailures": [],
  "tokenEstimate": 28500
}
```

6. Retrieval MUST include traceability: which memories/artifacts were selected and why (relevance score).
7. Agent-type-specific retrieval profiles:

| Agent Type | Priority Topics |
|------------|----------------|
| `backend-engineer` | openapi, database-schema, architecture, prior API bugs |
| `frontend-engineer` | requirements UI sections, architecture frontend, openapi |
| `fix` | failure reports, healing history, relevant source excerpts |
| `testing` | requirements acceptance criteria, openapi, browser flows |
| `deployment` | architecture infra section, deployment history |

8. Retrieval MUST complete within 10 seconds (p95).
9. Cache retrieval results per task attempt (invalidate on retry with new failure context).
10. Missing critical context (e.g., `openapi.yaml` not found) MUST block task start with clear error.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Task assignment | JSON |
| Input | Memory index (FR-18) | Search API |
| Input | Workspace artifacts | Files |
| Output | Context bundle | JSON |
| Output | Retrieval trace | `artifacts/context/{taskId}-{attempt}.json` |

## Acceptance Criteria

- [ ] Backend task context includes `openapi.yaml` excerpt and schema
- [ ] Fix Agent retry context includes prior healing log entries
- [ ] Context bundle within token budget (truncation strategy documented)
- [ ] Retrieval trace shows top 10 memory hits with scores
- [ ] Missing `openapi.yaml` blocks task with `CONTEXT_INCOMPLETE` error
- [ ] Retrieval p95 < 10s on reference mission
- [ ] Context bundle injected into ACP session (FR-08)

## Dependencies

- FR-18 — Memory store
- FR-08 — Context injection
- FR-07 — Pre-execution hook
- FR-05 — Task descriptions

## Non-Goals

- Real-time memory updates during agent execution (snapshot at start)
- Cross-mission retrieval
- User-provided context hints (v1; future mission amendment)

## Open Questions

1. Truncation strategy: recency vs. relevance vs. artifact priority?
2. Embed full artifact files vs. excerpts in bundle?
3. Re-retrieve mid-session on agent request?

## Examples

**Retrieval request:**

```json
{
  "missionId": "m-7f3a2b1c",
  "taskId": "t-contacts-api",
  "agentType": "backend-engineer",
  "query": "Implement /api/contacts CRUD per openapi.yaml",
  "tokenBudget": 32000
}
```

**Retrieval trace excerpt:**

```json
{
  "contextId": "ctx-t-contacts-api-001",
  "selections": [
    { "source": "artifact", "path": "openapi.yaml", "reason": "direct dependency", "tokens": 4200 },
    { "source": "artifact", "path": "database-schema.md", "reason": "direct dependency", "tokens": 1800 },
    { "source": "memory", "id": "mem-arch-003", "relevance": 0.94, "topic": "api-patterns", "tokens": 450 },
    { "source": "memory", "id": "mem-req-001", "relevance": 0.89, "topic": "contacts", "tokens": 320 }
  ],
  "tokenEstimate": 8770,
  "truncated": false
}
```
