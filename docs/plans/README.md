# ASF Implementation Plans

Engineering execution plans derived from `docs/` contracts and `requirements/`. Architecture decisions live in ADRs — plans describe **how** and **when**, not **whether**.

## Plans

| Plan | Status | Description |
|------|--------|-------------|
| [v1-implementation-plan.md](./v1-implementation-plan.md) | **Active** | Local-first, CLI-first v1 — Bun server, SQLite, `asf agent run`, CRM E2E |

## How plans relate to other docs

```
requirements/     Product FRs and framework specs
       │
       ▼
docs/             Engineering contracts (ADD, workflow-dsl, ADRs)
       │
       ▼
docs/plans/       Milestones, packages, sequencing (this folder)
       │
       ▼
packages/         Implementation code
```

## Conventions

- Milestones use **M0, M1, …** with explicit exit gates and verification commands.
- Open decisions reference **OD-** IDs from [ADD §13](../ADD.md#13-open-decisions) or plan-local IDs (OD-11+).
- Plans are updated when milestones complete or scope is cut — not duplicated in ADRs.

## Related

- [docs/README.md](../README.md) — documentation index and implementation sequence
