# @olagent/mcp-proxy

In-process MCP proxy for ASF v1 — session-scoped tool routing with workspace jail, git denylist, terminal argv allowlist, and audit logging.

## Overview

The MCP proxy enforces process sandbox policies (E3–E6 from [agent-runtime.md](../../docs/agent-runtime.md)) at the tool boundary:

| Tool | Enforcement |
|------|-------------|
| `filesystem.read` / `write` / `list` | Path jail under mission workspace |
| `git.status` / `git.diff` | Read-only; global denylist blocks push/merge/rebase |
| `terminal.run` | `argv[0]` prefix allowlist; no shell interpolation |
| `vault.get` | Stub — env map or `.asf/secrets.json`; secrets never in bundles |
| Browser tools | Stub (`NOT_IMPLEMENTED` in M4) |

## HTTP API

Started by `asf server start` on `127.0.0.1:3101` (configurable via `ASF_MCP_PORT`):

```
POST /mcp/v1/sessions     — register session { sessionId, workspace, agentType }
POST /mcp/v1/tools/call   — invoke tool { sessionId, name, arguments }
GET  /mcp/v1/tools/list   — list authorized tools for agent type
GET  /mcp/health          — liveness
```

Context bundles include `mcpEndpoint` (e.g. `http://127.0.0.1:3101/mcp`).

## Audit log

Every tool call appends a JSON line to:

```
{workspace}/.asf/audit/{sessionId}.jsonl
```

Secrets in params are redacted.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `ASF_MCP_PORT` | `3101` | HTTP listen port |
| `ASF_MCP_ENDPOINT` | `http://127.0.0.1:3101/mcp` | Full endpoint URL (set by server) |

## Tests

```bash
bun test packages/mcp-proxy
```

## Related

- [process-sandbox.md](../../requirements/framework/process-sandbox.md)
- [mcp-integration.md](../../requirements/framework/mcp-integration.md)
- [agent-contracts.md](../../docs/agent-contracts.md)
