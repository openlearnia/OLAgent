# @olagent/acp-client

ACP (Agent Client Protocol) client for OLAgent — spawns Cursor `agent acp`, speaks JSON-RPC over stdio, and delegates filesystem/terminal/permission requests to the MCP proxy.

## Usage

```typescript
import { runCursorAcpSession } from "@olagent/acp-client";
import type { ContextBundle } from "@olagent/workflow-engine";

const result = await runCursorAcpSession(bundle, {
  // optional overrides
  agentBin: process.env.ASF_CURSOR_AGENT_BIN ?? "agent",
});

console.log(result.stopReason, result.artifactsHint);
```

## Environment

| Variable | Description |
|----------|-------------|
| `CURSOR_API_KEY` | Cursor API key (production) |
| `ASF_CURSOR_AGENT_BIN` | Path to `agent` binary (default: `agent`) |
| `ASF_ACP_PERMISSION_MODE` | `auto` (default) or `strict` |

## Lifecycle

1. Register MCP proxy session from bundle `mcpEndpoint` / `sessionId`
2. Spawn `agent acp` with workspace cwd
3. `initialize` → `authenticate` (when key present) → `session/new` → `session/prompt`
4. Handle inbound `fs/*`, `terminal/*`, `session/request_permission`
5. Collect `session/update` notifications → `AcpSessionResult`

## Tests

```bash
bun test packages/acp-client
```

Recorded fixture tests use `tests/fixtures/mock-agent.ts` — no live Cursor in CI.

Optional live smoke:

```bash
CURSOR_API_KEY=... bun run packages/acp-client/scripts/acp-smoke.ts
```

## M5b (not in this package yet)

Agent Runtime Caller wiring (`runCursorAcpSession` from `caller.ts`) lands in M5b.
