# FR-18 — Long-Term Memory

## Summary

ASF must persist mission knowledge across agent sessions and task executions — requirements, research, architecture decisions, bugs, test results, and deployment history — enabling continuity and informed decision-making throughout the mission lifecycle.

## User Story

> As the ASF platform, I need agents to remember what was decided and what happened earlier in the mission so that later agents don't repeat work or contradict prior decisions.

## System Story

> As the Long-Term Memory system, I must accept structured memory commits from agents and platform events, index them semantically, retain mission-scoped history, and serve retrieval queries for FR-19.

## Requirements

1. Memory MUST persist the following categories:

| Category | `kind` | Examples |
|----------|--------|----------|
| Requirements | `requirements` | REQ-F-001, personas |
| Research | `research` | Technology recommendations |
| Architecture | `architecture` | ADRs, design decisions |
| Decisions | `decision` | Runtime choices with rationale |
| Bugs | `bug` | Defects found and fixed |
| Test results | `test-result` | Pass/fail summaries |
| Deployment | `deployment` | URLs, timestamps, targets |
| Healing | `healing` | Self-healing iteration logs |

2. Each memory entry MUST include:
   - `id`, `missionId`, `kind`, `topic`, `content` (self-contained text)
   - `source_path` (artifact file if applicable)
   - `createdAt`, `author` (agent type or `system`)
   - `metadata` (structured tags)
3. Memory writes MUST use commit semantics (immutable entries; corrections via new commits referencing parent).
4. Memory MUST be mission-scoped — no cross-mission leakage.
5. Memory MUST survive agent session termination and orchestrator restarts.
6. Storage SHOULD use Shared Memory MCP or equivalent semantic memory backend.
7. Retention: mission memory retained for configurable period (default: 90 days post-completion).
8. Memory commits MUST be triggered automatically on:
   - Artifact generation (FR-02, FR-03, FR-04)
   - Test completion (FR-12)
   - Failure events (FR-13)
   - Healing iterations (FR-14)
   - Deployment (FR-16, FR-17)
9. Full-text and semantic search MUST be supported.
10. Memory MUST NOT store secrets, credentials, or PII beyond test fixtures.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Agent/platform events | Structured payloads |
| Input | Artifact files | Indexed by path |
| Output | Memory entries | Committed records |
| Output | Commit history | Per-mission timeline |
| Output | Search results | Ranked entries (FR-19) |

## Acceptance Criteria

- [ ] Requirements from FR-02 searchable by "contact management"
- [ ] Architecture decision retrievable by topic "auth"
- [ ] Bug/fix history available for Fix Agent on retry
- [ ] Deployment URL retrievable without re-reading deployment report file
- [ ] Memory scoped to mission — query for mission A returns no mission B entries
- [ ] Memory survives service restart
- [ ] Secret scanner rejects memory commits containing API keys

## Dependencies

- FR-19 — Retrieval consumer
- All agents — Memory producers
- [framework/mcp-integration.md](../framework/mcp-integration.md) — Memory MCP

## Non-Goals

- Cross-mission knowledge transfer (future)
- User-editable memory (v1: agent/system writes only)
- Memory compression or summarization (v1)

## Open Questions

1. Shared Memory MCP vs. embedded vector DB?
2. Memory size limits per mission?
3. Export memory as markdown bundle on mission completion?

## Examples

**Memory commit (requirements):**

```json
{
  "project_id": "m-7f3a2b1c",
  "content": "REQ-F-001: Users MUST manage contacts with CRUD. Fields: name, email, phone, company, notes.",
  "source_path": "requirements.md",
  "commit_message": "Index requirements from discovery agent",
  "author": "requirement-discovery",
  "metadata": {
    "kind": "requirements",
    "topic": "contacts",
    "req_id": "REQ-F-001"
  }
}
```

**Memory commit (healing):**

```json
{
  "project_id": "m-7f3a2b1c",
  "content": "Iteration 2 fix: Drizzle query used 'contact_name' but schema column is 'name'. Changed in contacts.ts:42.",
  "source_path": "artifacts/healing-log/t-test-contacts.json",
  "commit_message": "Record self-healing fix for contacts 500 error",
  "author": "fix",
  "metadata": {
    "kind": "healing",
    "topic": "contacts-api",
    "task_id": "t-test-contacts"
  },
  "parent_commit_id": "mem-heal-001"
}
```
