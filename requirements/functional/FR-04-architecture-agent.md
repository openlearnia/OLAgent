# FR-04 — Architecture Agent

## Summary

The Architecture Agent synthesizes requirements and research into system design artifacts: `architecture.md`, `database-schema.md`, and `openapi.yaml`. These artifacts define the technical contract for implementation agents and the task planner.

## User Story

> As a user, I want ASF to design a coherent system architecture before writing code so that backend, frontend, and infra agents implement compatible components.

## System Story

> As the Architecture Agent, I must read requirements and research, make justified design decisions, document them, and produce machine- and human-readable artifacts that implementation agents can follow without ambiguity.

## Requirements

1. The agent MUST run after FR-02 and FR-03 complete successfully.
2. The agent MUST read: `requirements.md`, `research-report.md`, mission constraints.
3. The agent MUST produce:
   - `architecture.md` — system overview, component diagram, tech stack, data flow, security model
   - `database-schema.md` — tables/collections, relationships, indexes, migration notes
   - `openapi.yaml` — REST API contract (OpenAPI 3.1) covering all REQ-F-* endpoints
4. Architecture decisions MUST include an ADR-style section: Decision, Context, Consequences.
5. `openapi.yaml` MUST validate against OpenAPI 3.1 schema (lint check in CI).
6. `database-schema.md` MUST map entities to requirements IDs (traceability matrix).
7. The agent MUST align with mission constraints; deviations MUST be documented as explicit trade-offs.
8. Artifacts MUST be committed to workspace and indexed in memory (FR-18).
9. On completion, MUST trigger Task Planner (FR-05) via workflow event.
10. The agent MUST NOT write implementation code — design artifacts only.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | `requirements.md` | Markdown |
| Input | `research-report.md` | Markdown |
| Output | `architecture.md` | Markdown |
| Output | `database-schema.md` | Markdown |
| Output | `openapi.yaml` | YAML (OpenAPI 3.1) |
| Output | `docs/adr/` | Optional ADR files |

## Acceptance Criteria

- [ ] CRM mission produces all three required artifacts
- [ ] Every REQ-F-* requirement maps to at least one API path or schema entity
- [ ] `openapi.yaml` passes spectral/openapi lint
- [ ] Component diagram included in `architecture.md` (Mermaid acceptable)
- [ ] Task Planner can derive implementation tasks from artifacts without human input
- [ ] Security section addresses authentication per REQ-F-003

## Dependencies

- FR-02, FR-03 — Inputs
- FR-05 — Triggered on completion
- FR-09 — Implementation follows these contracts
- FR-18, FR-19 — Memory

## Non-Goals

- Infrastructure-as-code generation (Infra Agent responsibility)
- Performance load testing design
- Detailed UI mockups (Frontend Agent interprets requirements)

## Open Questions

1. Should architecture support GraphQL/tRPC in addition to REST?
2. Human approval gate before planning?
3. Versioning strategy when architecture is revised mid-mission?

## Examples

**`architecture.md` excerpt:**

```markdown
# Architecture — Small Business CRM

## Components
- **API Worker** (Hono on Cloudflare Workers) — REST API per openapi.yaml
- **Web App** (React + Vite) — SPA served via Cloudflare Pages
- **Database** (D1) — Schema per database-schema.md
- **Auth** (Better Auth) — Session cookies, email/password

## Data Flow
Browser → Pages (static) → API Worker → D1
Auth: Better Auth middleware on API Worker
```

**`openapi.yaml` excerpt:**

```yaml
openapi: 3.1.0
info:
  title: Small Business CRM API
  version: 0.1.0
paths:
  /api/contacts:
    get:
      operationId: listContacts
      summary: List all contacts
      responses:
        '200':
          description: Contact list
    post:
      operationId: createContact
      summary: Create a contact
```

**`database-schema.md` excerpt:**

```markdown
## contacts
| Column | Type | Constraints | Maps To |
|--------|------|-------------|---------|
| id | TEXT | PK, UUID | REQ-F-001 |
| name | TEXT | NOT NULL | REQ-F-001 |
| email | TEXT | UNIQUE | REQ-F-001 |
```
