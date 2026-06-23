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
