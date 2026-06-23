# FR-09 — Code Generation

## Summary

Implementation agents must generate and modify source code, tests, and documentation within the mission workspace, adhering to architecture contracts and project conventions, with all changes tracked via version control.

## User Story

> As a user, I want ASF to write real, maintainable application code — not prototypes — that follows the designed architecture and includes tests and docs.

## System Story

> As an implementation agent (backend, frontend, infra), I must read architecture artifacts, generate or modify code files, follow stack conventions, produce corresponding tests, update documentation, and leave the workspace in a buildable state.

## Requirements

1. Code generation MUST adhere to:
   - `openapi.yaml` for API implementations
   - `database-schema.md` for data layer
   - `architecture.md` for component boundaries and patterns
   - Mission constraint `stack` (e.g., TypeScript, Bun, React)
2. Agents MUST support both **greenfield generation** and **modification** of existing files in the workspace.
3. For each feature implementation task, agents SHOULD produce:
   - Source code files
   - Corresponding unit tests (co-located or `*.test.ts` convention)
   - Updated `README.md` or inline docstrings for public APIs
4. Generated code MUST:
   - Pass project linter (if configured)
   - Compile/typecheck without errors
   - Follow existing project structure if `setup-repo` task already ran
5. Agents MUST NOT:
   - Hardcode secrets, API keys, or credentials
   - Delete unrelated files without explicit task instruction
   - Introduce dependencies outside approved stack without ADR note
6. Large changes SHOULD be incremental across multiple tasks (planner responsibility).
7. Code comments MUST explain non-obvious business logic only (not narrate obvious code).
8. All file writes MUST occur within mission workspace via MCP filesystem tools.
9. After code generation, agent MUST run `bun install` / typecheck if dependencies changed.
10. Agent completion report MUST list all created/modified files.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Architecture artifacts | MD, YAML |
| Input | Task description + acceptance criteria | JSON |
| Input | Existing codebase | Workspace files |
| Output | Source files | `.ts`, `.tsx`, `.sql`, etc. |
| Output | Test files | `*.test.ts` |
| Output | Documentation | `README.md`, docstrings |
| Output | Config files | `package.json`, `wrangler.toml`, etc. |

## Acceptance Criteria

- [ ] CRM contacts API matches `openapi.yaml` request/response schemas
- [ ] Generated TypeScript compiles with `bun run typecheck`
- [ ] Unit tests exist for each new API endpoint
- [ ] No secrets in generated source (secret scanner passes)
- [ ] Modifications preserve existing unrelated functionality
- [ ] File change list accurate in agent completion report

## Dependencies

- FR-04 — Architecture contracts
- FR-07 — Agent execution
- FR-08 — ACP session
- FR-10 — Git commits
- FR-12 — Tests validate generated code
- FR-19 — Context retrieval

## Non-Goals

- Code review by human before commit (v1 relies on automated gates)
- Supporting all programming languages (v1: TypeScript/Bun primary)
- Automatic code formatting debate resolution (use project formatter config)

## Open Questions

1. Enforce test coverage threshold (e.g., 80%) before task completion?
2. Shared component library generation across missions?
3. Auto-run formatter on all generated files?

## Examples

**Backend agent task context:**

```yaml
task:
  id: t-contacts-api
  type: implement-backend
  description: |
    Implement Hono routes for /api/contacts per openapi.yaml.
    Use Drizzle ORM with D1 per database-schema.md.
    Include unit tests with bun:test.
  acceptance_criteria:
    - All openapi paths implemented
    - bun test packages/api passes
```

**Expected output structure:**

```
packages/api/
  src/
    routes/
      contacts.ts
      contacts.test.ts
    db/
      schema.ts
  package.json
```
