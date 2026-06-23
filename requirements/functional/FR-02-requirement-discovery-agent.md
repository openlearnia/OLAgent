# FR-02 — Requirement Discovery Agent

## Summary

The Requirement Discovery Agent researches the mission domain, elicits implicit requirements from the stated goal, and produces a structured `requirements.md` artifact that downstream agents use for architecture and planning.

## User Story

> As a user who provided a high-level goal, I want ASF to figure out what features, constraints, and acceptance criteria my application needs so that I don't have to write a full PRD myself.

## System Story

> As the Requirement Discovery Agent, I must analyze the mission goal and constraints, research domain norms for similar applications, identify functional and non-functional requirements, and write `requirements.md` to the mission workspace and long-term memory.

## Requirements

1. The agent MUST be invoked automatically after mission creation (FR-01) before architecture work begins.
2. The agent MUST read: mission goal, constraints, and any user-provided reference materials in the workspace.
3. The agent MUST produce `requirements.md` containing at minimum:
   - Executive summary
   - User personas (at least one)
   - Functional requirements (numbered, testable)
   - Non-functional requirements (performance, security, scalability)
   - Out-of-scope items (non-goals)
   - Open questions requiring human input (if any)
4. Requirements MUST be traceable to mission goal statements (source references or rationale).
5. The agent SHOULD identify domain-specific compliance needs (GDPR, HIPAA) when applicable and flag them.
6. Output MUST be committed to the mission workspace and indexed in long-term memory (FR-18).
7. On completion, the agent MUST emit `task.completed` with artifact paths.
8. If critical ambiguity blocks progress, the agent MUST set mission/task to `BLOCKED` with specific questions in `requirements.md` § Open Questions.
9. The agent MUST NOT produce architecture or implementation decisions — scope is requirements only.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Mission goal + constraints | JSON/YAML |
| Input | User reference files | Optional attachments |
| Output | `requirements.md` | Markdown |
| Output | Memory entry | `kind: requirements`, topic tagged |

## Acceptance Criteria

- [ ] CRM mission produces `requirements.md` with contact management, pipeline, and auth requirements
- [ ] Each functional requirement has a unique ID (e.g., `REQ-F-001`)
- [ ] Non-goals section explicitly scopes out v1 features
- [ ] Artifact is readable by Architecture Agent (FR-04) without transformation
- [ ] Ambiguous missions produce `BLOCKED` status with actionable questions
- [ ] Requirements indexed in memory and retrievable by FR-19

## Dependencies

- FR-01 — Mission creation
- FR-18 — Long-term memory persistence
- FR-19 — Context retrieval (for downstream)
- [framework/agent-framework.md](../framework/agent-framework.md)
- [framework/mcp-integration.md](../framework/mcp-integration.md) — Filesystem, memory MCP

## Non-Goals

- Interactive clarification chat with the user (v1 uses BLOCKED + questions)
- Legal contract generation
- Competitive analysis deep-dives (light domain research only; deep research is FR-03)

## Open Questions

1. Minimum requirement count or depth for "complete" discovery?
2. Should the agent produce user stories in Given/When/Then format?
3. Human approval gate before proceeding to architecture?

## Examples

**Excerpt from generated `requirements.md`:**

```markdown
# Requirements — Small Business CRM

## Executive Summary
A web-based CRM enabling small businesses to manage contacts, track deals,
and authenticate team members.

## Functional Requirements

### REQ-F-001: Contact Management
Users MUST be able to create, read, update, and delete contact records
with fields: name, email, phone, company, notes.

### REQ-F-002: Deal Pipeline
Users MUST be able to create deals linked to contacts with stages:
Lead → Qualified → Proposal → Won/Lost.

### REQ-F-003: Authentication
Users MUST authenticate via email/password. Session persistence REQUIRED.

## Non-Functional Requirements

### REQ-NF-001: Performance
Contact list MUST load in < 2s for up to 1,000 records.

## Non-Goals (v1)
- Email integration (Gmail/Outlook sync)
- Mobile native apps
- Multi-tenant billing
```
