# OLAgent

Agentic Software Factory — requirements, architecture, and implementation spikes.

**Repository:** https://github.com/openlearnia/OLAgent

## Quick start

```bash
bun install
export ASF_INTERNAL_JWT_SECRET=dev-secret-change-me
export ASF_HOME=$PWD/.asf-local
export ASF_USE_STUB_AGENTS=1

# Terminal 1 — control plane
bun run asf server start

# Terminal 2 — operator flow
bun run asf mission create --file requirements/fixtures/local-operator-mission.yaml
bun run asf mission start m-crm-local
bun run asf mission watch m-crm-local --interval 3
```

## Packages

| Package | Description |
|---------|-------------|
| [`packages/asf-cli`](./packages/asf-cli/) | Operator `asf` CLI (M1) |
| [`packages/workflow-engine`](./packages/workflow-engine/) | Workflow state machine + HTTP API |

```bash
bun test
```

## Repository layout

- `docs/` — ADD, workflow DSL, agent contracts, [CLI reference](./docs/cli-reference.md)
- `requirements/` — FRs, schemas, fixtures
- `packages/` — Bun workspace packages
