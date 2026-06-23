# FR-10 — Git Operations

## Summary

ASF must manage version control throughout mission execution: create branches, commit agent changes with descriptive messages, and merge to the main line only after validation gates pass.

## User Story

> As a user, I want all autonomous code changes tracked in git with clear history so that I can audit what ASF did and roll back if needed.

## System Story

> As the Git Operations layer, I must initialize or bind a repository per mission, enforce branch strategy, commit agent artifacts atomically, run pre-merge validation, and merge approved branches.

## Requirements

1. Each mission MUST have an associated git repository (initialized or cloned from `constraints.repository`).
2. Branch strategy (v1):
   - `main` — protected; only receives merges after validation
   - `mission/{missionId}` — integration branch for mission work
   - `task/{taskId}` — optional per-task branches; merged to mission branch on task success
3. Agents MUST commit via MCP git tools, not raw filesystem manipulation of `.git`.
4. Commit messages MUST follow conventional format:
   ```
   <type>(<scope>): <description>

   [optional body]

   Task: <taskId>
   Agent: <agentType>
   ```
   Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`
5. Commits MUST be atomic per logical unit of work (one task may produce multiple commits).
6. The system MUST NOT force-push to `main`.
7. Merge to `main` MUST occur only when:
   - All implementation tasks for the epic/mission phase are `SUCCESS`
   - `bun test` (or configured test command) passes
   - Linter passes (if configured)
   - Secret scan passes (no credentials, API keys, or tokens in diff)
   - No merge conflicts
8. Merge conflicts MUST set task to `BLOCKED` with conflict details for Fix Agent or human.
9. Git operations MUST be logged: branch, commit SHA, author (`ASF Agent <agentType>`), timestamp.
10. Tags SHOULD be created on mission `SUCCESS`: `mission/{missionId}/complete`.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Agent file changes | Workspace diff |
| Input | Task metadata | taskId, agentType |
| Output | Git commits | SHA references |
| Output | Branch state | Branch names, HEAD |
| Output | Merge records | Audit log |

## Acceptance Criteria

- [ ] Mission workspace is a valid git repo after setup task
- [ ] Agent commits include task ID in message footer
- [ ] `main` not updated while tests failing
- [ ] Force-push to `main` rejected by policy
- [ ] Merge conflict surfaces as `BLOCKED` with file list
- [ ] Completion tag created on mission success
- [ ] Full git history visible from Mission Dashboard

## Dependencies

- FR-09 — Code changes to commit
- FR-12 — Validation before merge
- FR-07 — Agent execution
- [framework/mcp-integration.md](../framework/mcp-integration.md) — Git MCP
- [framework/security.md](../framework/security.md) — Secret handling

## Non-Goals

- Pull request creation on GitHub (v1: local merge; PR integration in future)
- Signed commits / GPG
- Git LFS for large assets

## Open Questions

1. Push to remote on every commit or only on mission completion?
2. Squash commits on merge to main?
3. Submodule/monorepo handling for multi-package missions?

## Examples

**Agent commit:**

```
feat(api): implement contacts CRUD endpoints

Adds Hono routes for /api/contacts matching openapi.yaml.
Includes unit tests for all operations.

Task: t-contacts-api
Agent: backend-engineer
```

**Branch layout:**

```
main
└── mission/m-7f3a2b1c-...
    ├── task/t-setup
    ├── task/t-schema
    └── task/t-contacts-api
```

**Pre-merge validation gate:**

```yaml
merge_gate:
  branch: mission/m-7f3a2b1c-...
  target: main
  checks:
    - command: bun test
      required: true
    - command: bun run lint
      required: true
    - command: bun run typecheck
      required: true
    - command: secret-scan
      required: true
```
