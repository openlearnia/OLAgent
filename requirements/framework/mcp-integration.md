# ASF-FW-03 — MCP Integration

## Summary

ASF exposes all agent tool capabilities through Model Context Protocol (MCP) servers — providing a standardized, sandboxed interface for filesystem, git, browser, memory, terminal, database, deployment, and monitoring operations.

## User Story

> As an agent developer, I need agents to access tools through a consistent MCP interface so that tool permissions, auditing, and sandboxing are uniform across all agent types.

## System Story

> As the MCP integration layer, I must host and proxy MCP servers, enforce per-agent tool allowlists, audit tool calls, and ensure session-scoped isolation.

## MCP Server Surface

| Server | Tools | Used By |
|--------|-------|---------|
| **Filesystem** | `read`, `write`, `list`, `delete`, `exists` | All agents |
| **Git** | `status`, `diff`, `add`, `commit`, `branch`, `checkout`, `merge`, `log` | Implementation, fix, testing |
| **Browser** | `page_navigate`, `page_type`, `page_click`, `page_text`, `page_screenshot`, `page_network`, `page_console`, `page_wait`, `page_find`, `page_elements`, `browser_launch`, `browser_close` | Testing, verification, frontend |
| **Memory** | `commit`, `search`, `get`, `list_recent` | All agents |
| **Terminal** | `exec`, `spawn` (bounded) | Implementation, testing, deployment |
| **Database** | `query`, `migrate`, `schema` | Backend, infra |
| **Deployment** | `deploy`, `status`, `rollback`, `logs` | Deployment, infra |
| **Monitoring** | `metrics`, `logs`, `health` | All agents (read), platform (write) |
| **Web** *(stub)* | `search`, `fetch` | Research, requirement-discovery |
| **Context7** *(stub)* | `resolve_library`, `get_docs` | Research |

**Web MCP URL policy:** `web.fetch` URLs MUST match platform allowlist in [security.md](./security.md) § Web MCP. SSRF to internal networks is prohibited.

## Requirements

1. Each MCP server MUST implement standard MCP protocol (JSON-RPC over stdio/HTTP).
2. Tool access MUST be enforced per agent type (FR-07 capability matrix).
3. Unauthorized tool calls MUST return error `TOOL_NOT_AUTHORIZED` without executing.
4. All tool calls MUST be audit-logged: `{ sessionId, agentType, tool, params (redacted), result, duration, timestamp }`.
5. Filesystem MCP MUST enforce workspace boundary — no access outside `workspaces/{missionId}/`.
6. Terminal MCP MUST:
   - Block destructive commands (`rm -rf /`, `mkfs`, etc.)
   - Enforce timeout per command (default: 5 minutes)
   - Capture stdout/stderr
   - Use argv arrays (no shell interpolation) per [security.md](./security.md)
7. Git MCP MUST enforce branch policies (FR-10) — no force-push to main.
8. Browser MCP MUST follow FR-11 OLTestStack conformance profile (`page.*` tools, `elementId` model).
9. Memory MCP MUST follow FR-18 commit semantics.
10. Deployment MCP MUST use credential injection — never accept secrets in tool params.
11. Web and Context7 MCP servers MUST be registered for FR-07 `research` and `requirement-discovery` agents (v1: stub implementations acceptable; full spec in ADD).
12. MCP servers MUST be discoverable via `tools/list` with JSON schemas for each tool.
13. Session-scoped MCP proxy MUST route tools to correct isolated backend (FR-08).
14. All MCP enforcement MUST comply with [security.md](./security.md).

## Security Requirements

1. Path traversal attacks MUST be blocked in filesystem operations.
2. Command injection MUST be prevented in terminal exec (no shell interpolation of untrusted input).
3. Network access from terminal MUST be restricted to allowlist (package registries, git remotes, deployment APIs).
4. Secret values MUST be redacted in audit logs.
5. MCP server processes MUST run with minimum OS permissions.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Tool call requests | MCP JSON-RPC |
| Output | Tool call responses | MCP JSON-RPC |
| Output | Audit log | JSON per call |
| Output | Tool schemas | JSON Schema |

## Acceptance Criteria

- [ ] All ten MCP servers registered and discoverable (including Web and Context7 stubs)
- [ ] Backend agent can use filesystem, git, terminal; cannot use deployment.deploy
- [ ] Filesystem blocks `../../etc/passwd` path traversal
- [ ] Terminal blocks `rm -rf /`
- [ ] All tool calls appear in session audit log
- [ ] Secrets redacted in logs (verified with test secret injection)
- [ ] Browser tools match FR-11 OLTestStack conformance profile
- [ ] Memory tools support commit and semantic search

## Dependencies

- FR-07 — Agent tool profiles
- FR-08 — Session-scoped proxy
- FR-11 — Browser tools
- FR-18 — Memory tools
- FR-10 — Git policies
- [security.md](./security.md) — Platform security requirements

## Non-Goals

- Custom MCP protocol extensions (use standard MCP)
- MCP server hot-reload (restart required for v1)
- Third-party MCP server marketplace

## Open Questions

1. stdio vs. HTTP transport for MCP servers?
2. Shared OLTestStack MCP vs. embedded browser server?
3. Bun MCP server for package management integration?

## Examples

**Tool authorization check:**

```json
{
  "agentType": "frontend-engineer",
  "tool": "deployment.deploy",
  "authorized": false,
  "error": "TOOL_NOT_AUTHORIZED"
}
```

**Audit log entry:**

```json
{
  "sessionId": "acp-s-4a3b2c1d",
  "agentType": "backend-engineer",
  "tool": "git.commit",
  "params": { "message": "feat(api): implement contacts CRUD" },
  "result": { "sha": "abc1234" },
  "duration_ms": 340,
  "timestamp": "2026-06-22T10:30:00Z"
}
```

**Filesystem boundary enforcement:**

```json
{
  "tool": "filesystem.read",
  "params": { "path": "/etc/passwd" },
  "error": "PATH_OUTSIDE_WORKSPACE",
  "workspace": "/workspaces/m-7f3a2b1c-..."
}
```
