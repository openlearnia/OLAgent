# FR-01 — Mission Creation

## Summary

ASF must accept a user's objective via natural-language prompt or a structured mission file, validate inputs, and instantiate a new Mission with an isolated workspace ready for autonomous execution.

## User Story

> As a user, I want to describe what I want built in plain language or a structured file so that ASF can begin autonomous development without further setup.

## System Story

> As the Mission Manager, I must parse mission input, assign a unique mission ID, provision a workspace, persist mission metadata, and enqueue the discovery phase (FR-02, FR-03).

## Requirements

1. The system MUST accept mission input via:
   - Natural-language prompt (CLI, API, or UI)
   - Structured mission file (`mission.yaml` or `mission.json`)
2. Mission files MUST support at minimum: `goal` (required), `constraints` (optional object).
3. Supported constraint keys SHOULD include: `stack`, `deployment`, `database`, `auth`, `maxRetries`, `repository`, `budget`.
4. The system MUST validate that `goal` is non-empty and within maximum length (e.g., 10,000 characters).
5. On successful creation, the system MUST:
   - Generate a UUID `missionId`
   - Create an isolated workspace directory: `workspaces/{missionId}/`
   - Persist mission record with status `PENDING`
   - Emit a `mission.created` event for downstream orchestration
6. Invalid input MUST return structured errors identifying the failing field.
7. The system SHOULD support idempotent creation via client-supplied `idempotencyKey`.
8. Mission creation MUST complete within 5 seconds excluding workspace provisioning on local disk.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | NL prompt | string |
| Input | `mission.yaml` | YAML |
| Output | Mission record | JSON (DB) |
| Output | Workspace path | `workspaces/{missionId}/` |
| Output | `mission.yaml` (copy) | Persisted in workspace root |

## Acceptance Criteria

- [ ] User can create a mission via API with `{ "goal": "Build a CRM for small businesses" }`
- [ ] User can create a mission by uploading `mission.yaml`
- [ ] Empty goal is rejected with HTTP 400 / CLI exit code 1
- [ ] Workspace directory is created and writable
- [ ] Mission appears in Mission Dashboard with status `PENDING`
- [ ] Constraints are persisted and accessible to downstream agents
- [ ] Duplicate idempotency key returns existing mission without duplication

## Dependencies

- [01-core-concepts.md](../01-core-concepts.md) — Mission entity
- [framework/workflow-engine.md](../framework/workflow-engine.md) — Initial scheduling
- FR-02, FR-03 — Triggered after creation

## Non-Goals

- Mission editing or goal refinement after creation (v1)
- Multi-user collaboration on mission definition
- Importing missions from external PM tools (Jira, Linear)

## Open Questions

1. Should users be able to attach reference files (mockups, existing repos) at creation time?
2. Is there a mission template catalog (e.g., "SaaS CRUD", "Landing page")?
3. Rate limiting per user/tenant for mission creation?

## Examples

**Natural-language API request:**

```json
POST /api/v1/missions
{
  "goal": "Build a CRM for small businesses",
  "constraints": {
    "stack": ["typescript", "bun", "react"],
    "deployment": "cloudflare",
    "maxRetries": 3
  }
}
```

**Structured mission file:**

```yaml
# mission.yaml
goal: "Build a CRM for small businesses"
constraints:
  deployment: cloudflare
  database: d1
  auth: better-auth
  stack:
    - typescript
    - bun
    - react
  maxRetries: 3
```

**Response:**

```json
{
  "id": "m-7f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "goal": "Build a CRM for small businesses",
  "status": "PENDING",
  "workspace": "workspaces/m-7f3a2b1c-.../",
  "createdAt": "2026-06-22T08:00:00Z"
}
```
