# OLAgent

Agentic Software Factory — requirements, architecture, and implementation spikes.

## Workflow engine spike (current)

Local Bun + SQLite workflow engine with CRM DAG simulation and an HTTP wrapper for `/internal/v1/*` routes.

```bash
bun install
bun test
```

Run the HTTP server:

```bash
export ASF_INTERNAL_JWT_SECRET=dev-secret-change-me
bun run --cwd packages/workflow-engine server
```

See **[packages/workflow-engine/README.md](./packages/workflow-engine/README.md)** for engine APIs, curl examples, and tests.

## Repository layout

- `docs/` — ADD, workflow DSL, agent contracts
- `requirements/` — FRs, schemas, fixtures
- `packages/workflow-engine/` — state machine spike (no LLM)
