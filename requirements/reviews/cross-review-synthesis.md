# Cross-Review Synthesis — ASF Requirements

**Date:** 2026-06-22  
**Scope:** All documents under `requirements/` (foundation, FR-01–FR-20, framework, future)  
**Review lenses:** Architect, Skeptic, QA, Orchestration, Security

---

## Executive Summary

Five adversarial reviews converged on a single verdict: the ASF requirements are a **strong pre-ADD product narrative** with clear domain vocabulary, FR traceability, MCP boundaries, and verification-gated success — but they are **not yet an execution contract**. A reference CRM demo in a controlled staging environment is plausible after P0 fixes; production-grade autonomous missions are not.

Every lens identified overlapping blockers: orchestration split-brain (bootstrap phases outside the workflow DAG), contradictory mission `SUCCESS` derivation, parallel git on shared surfaces, browser MCP API mismatch with OLTestStack, v1 scope inflation (seven deploy targets), and security controls deferred to open questions while privileged MCP tools are already authorized.

**Disposition:** Hold implementation. Close P0 spec gaps (applied in this pass), then produce ADD → Workflow DSL → Agent Contracts before engineering kickoff. Re-run this five-lens review against those downstream artifacts.

---

## Reviewer Matrix

| Lens | Verdict |
|------|---------|
| **Architect** | Conditional NO-GO for kickoff — three unreconciled system models (task-DAG engine, hard-coded SDLC pipeline, self-healing sidecar); spine is sound after P0 reconciliation. |
| **Skeptic** | Category-definition doc, not a factory — v1 scope reads like five products; cut to Cloudflare + Docker, serial repo mutation, narrow reference mission. |
| **QA** | Conditional pre-ADD pass / FAIL for test-ready sign-off — browser API inconsistent, missing verification agent, no reference oracle or recoverability matrix. |
| **Orchestration** | Conditionally viable vision, not orchestration contract — `RUNNING` crash semantics undefined, no leases/idempotency, FR-20 vs FR-17 SUCCESS contradiction. |
| **Security** | Conditional NO-GO for production multi-tenant; GO for single-operator staging after P0 hardening — isolation model open, shadow tool paths via terminal, no vault/RBAC/prod gate spec. |

---

## Unified P0 Blockers

| Priority | Issue | Affected FRs / Docs | Recommended Fix |
|----------|-------|---------------------|-----------------|
| P0 | Mission `SUCCESS` contradicts FR-17 gate (`01-core-concepts` vs FR-20) | FR-20, FR-17, `01-core-concepts` | Mission `SUCCESS` only when all tasks `SUCCESS` **and** `verify-deployment` task complete with FR-17 `verified`; model verification as explicit planner task. |
| P0 | Bootstrap phases (FR-02–04) run outside Workflow Engine | FR-02–05, FR-20, `02-proposed-architecture` | Treat discovery/architecture as workflow tasks; Workflow Engine is sole task-state writer (ADD). |
| P0 | `RUNNING` crash semantics undefined | `workflow-engine`, FR-08, FR-15 | Lease/heartbeat; orphaned `RUNNING` → `FAILED` (recoverable via retry). |
| P0 | Parallel tasks mutate shared git surfaces | FR-05, FR-06, FR-10 | Planner rule: tasks touching `package.json`, root app entry, `openapi.yaml` sequential unless `parallelSafe: true`. |
| P0 | v1 deploy scope inflated (7 targets) | FR-16, `00-overview` | v1 MUST: Cloudflare + Docker only; other targets → future. |
| P0 | Browser MCP API fights OLTestStack | FR-11, `mcp-integration` | Conformance profile: `page.*` + `elementId`; legacy `browser.*` mapping table. |
| P0 | No `verification` agent in registry | FR-07, FR-17 | Add `verification` agent type with browser, terminal, filesystem tools. |
| P0 | Security floor unspecified | FR-08, FR-10, FR-16, FR-17, `mcp-integration` | New `framework/security.md`: container isolation, vault outline, prod approval gate, terminal/browser allowlists, RBAC outline. |
| P0 | Self-healing can declare success without real verification | FR-14, FR-17 | Verification task and FR-17 gate are mandatory; healing cannot skip verify. |
| P0 | No reference mission oracle for CRM ACs | FR-01, FR-12, FR-17 | `fixtures/reference-crm-mission.md` as acceptance oracle. |
| P0 | Recoverability heuristics undefined | FR-13, FR-15 | Classification → recoverable decision table appendix in FR-13. |
| P0 | Workflow DSL promised but absent | `README`, all orchestration FRs | Produce Workflow DSL before code (implementation sequence below). |

---

## P1 / P2 Backlog (Condensed)

### P1

- Unify Mission Manager and Workflow Engine under single `TaskExecution` record with idempotency keys.
- Model FR-14 self-healing as workflow child tasks, not sidecar loop.
- Add `requirements/schemas/` for mission, task, failure event, verification report.
- Register Web and Context7 MCP servers in integration doc (stubs added).
- Secret scan in merge gate (applied to FR-10).
- `constraints.verification` schema on missions (applied to FR-17).
- Instrument monitoring for heal/verify loops (`framework/monitoring.md`).
- Bootstrap FR-02–04 as first-class workflow tasks in ADD.

### P2

- Merge queue or mandatory per-task branches with automated conflict resolution.
- Workflow versioning when planner re-runs.
- Temporal vs custom engine ADR with lease/heartbeat implementation detail.
- Security audit agent (see `future/future-enhancements.md`).
- PR-based git workflow, visual regression, ongoing production monitoring.
- Multi-repo missions, cost optimization, agent marketplace.

---

## Consensus Strengths

- **Domain model** — Mission → Task → Agent → Workflow vocabulary is consistent and UI-ready (`01-core-concepts`).
- **ACP + MCP boundary** — Session-per-attempt isolation with MCP-only tool surface is the right security thesis.
- **Terminal state semantics** — `BLOCKED` vs `FAILED` distinction is clear and actionable.
- **Git safety** — No force-push to `main`; merge gates before integration.
- **FR traceability** — Dependency graph, artifact model, and acceptance criteria per FR.
- **Verification-gated success** — FR-17 intent is correct (now aligned with derivation rules).
- **Honest scope bucket** — `future/future-enhancements.md` prevents silent scope creep.

---

## Recommended Implementation Sequence

```
1. ADD (Architecture Design Document)
   └── Resolve engine choice, single orchestrator, persistence, lease model

2. Workflow DSL
   └── Task types, state transitions, continuation rules, healing as child tasks

3. Agent Contracts
   └── Per-type prompts, tool profiles, output schemas (incl. verification)

4. Implementation (ordered)
   └── Core workflow engine → ACP/MCP layer → reference CRM mission E2E
```

Do not begin agent implementation or MCP server coding until steps 1–3 address P0 items above.

---

## Documents Reviewed

### Foundation

- [00-overview.md](../00-overview.md)
- [01-core-concepts.md](../01-core-concepts.md)
- [02-proposed-architecture.md](../02-proposed-architecture.md)
- [README.md](../README.md)

### Functional Requirements (FR-01–FR-20)

- [functional/](../functional/) — all 20 FR documents

### Framework

- [agent-framework.md](../framework/agent-framework.md)
- [workflow-engine.md](../framework/workflow-engine.md)
- [mcp-integration.md](../framework/mcp-integration.md)
- [monitoring.md](../framework/monitoring.md)
- [user-interface.md](../framework/user-interface.md)
- [security.md](../framework/security.md) *(added post-review)*

### Future & Fixtures

- [future/future-enhancements.md](../future/future-enhancements.md)
- [fixtures/reference-crm-mission.md](../fixtures/reference-crm-mission.md) *(added post-review)*

---

## P0 Remediation Status

The following P0 fixes were applied directly to requirement files in the same change set as this synthesis:

| Fix | Files Updated |
|-----|---------------|
| SUCCESS gate + verify-deployment task | FR-20, FR-05, FR-07, `01-core-concepts` |
| Shared-surface serialization rule | FR-05 |
| `verification` agent type | FR-07 |
| Lease/heartbeat + sole state writer | `workflow-engine` |
| v1 deploy targets (Cloudflare + Docker) | FR-16, `00-overview`, `future-enhancements` |
| OLTestStack browser conformance | FR-11, `mcp-integration` |
| Security floor spec | `framework/security.md`, FR-08, FR-10 |
| Recoverability matrix | FR-13 |
| Verification constraints schema | FR-17 |
| Reference CRM oracle | `fixtures/reference-crm-mission.md` |
| Index updates | `README.md` |
