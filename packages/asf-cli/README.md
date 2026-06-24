# @olagent/asf-cli

Operator CLI for the Autonomous Software Factory (`asf` binary).

## Commands

| Command | Description |
|---------|-------------|
| `asf server start` | Start Mission Manager + Workflow Engine on `127.0.0.1:3100` |
| `asf mission create --file <path>` | Create mission from YAML/JSON fixture |
| `asf mission start <missionId>` | Start autonomous scheduling (internal JWT) |
| `asf mission status <missionId>` | Snapshot of mission + task states |
| `asf mission watch <missionId>` | Poll until terminal state |
| `asf mission events <missionId>` | List recent workflow events |
| `asf dev token` | Sign internal JWT for local `/internal/v1/*` curl |

See [docs/cli-reference.md](../../docs/cli-reference.md) for full flag reference.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `ASF_HOME` | `~/.asf` | Config, DB, workspace parent |
| `ASF_ENGINE_URL` | `http://127.0.0.1:3100` | Engine API base URL |
| `ASF_INTERNAL_JWT_SECRET` | — | **Required** for server + internal API |
| `ASF_WORKSPACES_ROOT` | `$ASF_HOME/workspaces` | Mission workspace directories |
| `ASF_USE_STUB_AGENTS` | off | Set `1` to auto-complete tasks with stubs (no LLM) |
| `ASF_AGENT_RUN_DRY_RUN` | `1` (implicit) | Set `0` for live agents (`cursor-acp` default backend) |
| `ASF_LLM_API_KEY` | — | Anthropic or OpenAI API key (required for live LLM) |
| `ASF_LLM_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `ASF_LLM_MODEL` | provider default | Override model id |
| `ASF_LLM_MOCK` | off | Set `1` for deterministic mock LLM (tests / demo) |
| `ASF_AGENT_BACKEND` | `cursor-acp` | `cursor-acp`, `custom-llm` (M3 fallback), or `stub` |
| `ASF_CURSOR_AGENT_TYPES` | `backend-engineer` | Agent types spawned via `agent acp` when backend is `cursor-acp` |
| `ASF_CURSOR_AGENT_BIN` | `agent` | Path to Cursor CLI binary |
| `ASF_LLM_AGENT_TYPES` | `backend-engineer` | Types for `custom-llm` backend when dry-run is off |
| `ASF_MCP_ENDPOINT` | local proxy | MCP URL in context bundles |

## M5b — Cursor ACP (default production path)

With `ASF_AGENT_BACKEND=cursor-acp` (default), `ASF_AGENT_RUN_DRY_RUN=0`, and `ASF_CURSOR_AGENT_TYPES=backend-engineer`:

- **`backend-engineer`** tasks spawn Cursor `agent acp` via `@olagent/acp-client`; the **caller** heartbeats and **POST**s `completeTask` from the session outcome.
- Types **not** in `ASF_CURSOR_AGENT_TYPES` use M2 dry-run so CRM missions can reach `SUCCESS` without full Cursor coverage.

```bash
export ASF_INTERNAL_JWT_SECRET=dev-secret-change-me
export ASF_HOME=$PWD/.asf-local
export CURSOR_API_KEY=...
export ASF_AGENT_RUN_DRY_RUN=0
export ASF_CURSOR_AGENT_TYPES=backend-engineer

bun run asf server start
```

CI / no Cursor: `ASF_AGENT_BACKEND=custom-llm` with `ASF_LLM_MOCK=1`, or `ASF_USE_STUB_AGENTS=1`.

## M3 — backend-engineer LLM pilot

With `ASF_AGENT_BACKEND=custom-llm`, `ASF_AGENT_RUN_DRY_RUN=0`, and `ASF_LLM_AGENT_TYPES=backend-engineer`:

- **`backend-engineer`** tasks spawn `asf agent run` **without** `--dry-run`, run a minimal LLM loop, write workspace artifacts, heartbeat every 30s, and **POST** `completeTask` from the agent process.
- **All other agent types** still use the M2 dry-run stub path so the CRM mission can reach `SUCCESS` without full LLM coverage.

```bash
export ASF_INTERNAL_JWT_SECRET=dev-secret-change-me
export ASF_HOME=$PWD/.asf-local
export ASF_LLM_MOCK=1          # or ASF_LLM_API_KEY=sk-...
export ASF_AGENT_RUN_DRY_RUN=0

bun run asf server start
bun run asf mission create --file requirements/fixtures/local-operator-mission.yaml
bun run asf mission start m-crm-local
bun run asf mission watch m-crm-local --interval 3
```

CI without secrets: `ASF_USE_STUB_AGENTS=1` (unchanged).

## Quick start

From repo root:

```bash
bun install
export ASF_INTERNAL_JWT_SECRET=dev-secret-change-me
export ASF_HOME=$PWD/.asf-local
export ASF_USE_STUB_AGENTS=1

# Terminal 1
bun run asf server start

# Terminal 2
bun run asf mission create --file requirements/fixtures/local-operator-mission.yaml
bun run asf mission start m-crm-local
bun run asf mission watch m-crm-local --interval 3
```

## Development

```bash
bun test packages/asf-cli
bun run --filter @olagent/asf-cli typecheck
```
