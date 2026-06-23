# Cross-Review Synthesis — ASF Engineering Docs

**Date:** 2026-06-22  
**Scope:** `docs/` (ADD.md, workflow-dsl.md, agent-contracts.md) reviewed against `requirements/`  
**Prior baseline:** [requirements/reviews/cross-review-synthesis.md](../../requirements/reviews/cross-review-synthesis.md)  
**Review lenses:** Architect, Skeptic, QA, Orchestration, Security

---

## Executive Summary

Five adversarial reviews of the post-P0 engineering contracts converged on a **verdict shift**: requirements-only P0 gaps are largely closed in `docs/`, but **execution contracts remain incomplete** without JSON schemas, reconciled healing ingress, internal API auth, and stale requirement cross-references.

**Disposition:** Conditional GO for a **single-operator, fixture-driven CRM staging demo** after this pass (schemas + P0 doc fixes). NO-GO for production multi-tenant, full autonomous factory without Skeptic Tier 0 cuts, or parallel git on shared surfaces without merge gates.

---

## Architecture Pivot (Local-First + CLI)

**Decision (2026-06-22):** v1 ASF runs **locally** on the operator machine. **Cloudflare is a deploy target only** — the Deployment Agent pushes generated user apps (Workers, Pages, D1) via FR-16; the platform orchestrator (Mission Manager, Workflow Engine, state) does **not** run on Cloudflare in v1.

| Concern | v1 | Deferred |
|---------|-----|----------|
| Platform runtime | CLI + engine + SQLite (single machine / Compose) | Cloudflare Workers + DO + D1 control plane |
| Cloudflare role | Outbound API for **user-app** deploy | Hosting ASF orchestration |
| Mission `runtime` | `local` (default) | `cloud` when hosted platform ships |

**Where documented:**

| Document | Content |
|----------|---------|
| [requirements/02-proposed-architecture.md](../../requirements/02-proposed-architecture.md) | § v1 Local Topology diagram |
| [requirements/functional/FR-16-deployment-agent.md](../../requirements/functional/FR-16-deployment-agent.md) | Platform vs. deploy-target note |
| [requirements/future/future-enhancements.md](../../requirements/future/future-enhancements.md) | Cloudflare-hosted orchestrator + design hooks |
| [requirements/schemas/mission.v1.json](../../requirements/schemas/mission.v1.json) | Optional `constraints.runtime` |
| [docs/ADD.md](../ADD.md) | §11.3 deploy targets; §11.1 production topology is **future** relative to v1 local-first |

**Note:** ADD §11.1 still describes a Cloudflare production topology for when hosted orchestration ships; v1 implementation follows local-first per requirements pivot above.

---

## Reviewer Matrix

| Lens | Verdict |
|------|---------|
| **Architect** | Conditional GO for reference CRM staging — `TaskExecution` spine, bootstrap-as-tasks, and verification gate are sound; not production/multi-tenant ready. |
| **Skeptic** | Conditional GO for narrow staging demo — custom engine viable for v1 if scope cut; NO-GO for full factory without Temporal or Tier 0 demo path. |
| **QA** | Conditional GO for narrow E2E — not FR sign-off until schemas, healing rules, and reference oracle are machine-validated. |
| **Orchestration** | ~70% of orchestration P0 closed — implementable spine; planner merge, single healing ingress, backoff, and gate model need normative closure. |
| **Security** | GO single-operator staging after P0 hardening — NO-GO production until `/internal/*` auth, Web MCP allowlist, terminal argv hardening, egress policy. |

---

## What `docs/` Fixed vs Requirements-Only

| Gap (requirements review) | Resolved in `docs/` | Still open (this pass) |
|---------------------------|---------------------|-------------------------|
| Three orchestrators / bootstrap sidecar | ADD §7 — seed DAG; Workflow Engine sole writer | `02-proposed-architecture.md` stale diagram |
| Mission SUCCESS vs FR-17 | ADD §4.5, workflow-dsl §9 | — |
| `RUNNING` crash semantics | ADD §12 lease + sweeper | Lease vs 2h agent timeout relationship |
| Parallel git on shared surfaces | ADD §9.3, workflow-dsl FR-05 refs | Gate nodes vs implicit merge side effect |
| v1 deploy scope inflation | ADD §11.3 — Cloudflare + Docker only | — |
| Browser MCP / OLTestStack mismatch | agent-contracts `page.*` tools | Missing tools in some agent lists |
| No verification agent | agent-contracts §12 | curl vs browser for API checks |
| Security floor deferred | ADD §10 references security.md | Internal API auth, Web MCP, egress |
| Self-healing sidecar | workflow-dsl `healing-child` §3.2 | Dual trigger (`needsHealing` vs `failure.detected`) |
| Workflow DSL absent | workflow-dsl.md full spec | JSON schemas not published |
| No reference oracle | requirements fixture exists | Sample `plan.json` + gate nodes |

---

## Unified P0 Blockers (Consolidated)

| Priority | Issue | Affected Docs | Fix (this pass) |
|----------|-------|---------------|-----------------|
| P0 | No `requirements/schemas/` | workflow-dsl events, FR-05, FR-17 | Publish JSON Schema v1 files |
| P0 | Dual healing ingress | workflow-dsl, ADD §8, FR-14 | `completeTask` canonical; `failure.detected` audit-only |
| P0 | Stale requirements contradict ADD | `02-proposed-architecture`, agent-framework, workflow-engine | Supersede banner + reconciliation |
| P0 | Gate merge implicit | workflow-dsl §3.3, CRM example | Planner merge semantics + `gate-merge-*` nodes |
| P0 | `/internal/v1/*` unauthenticated | ADD §5 | JWT/mTLS service auth spec |
| P0 | Web MCP SSRF | security.md, mcp-integration | URL allowlist for `web.fetch` |
| P0 | Terminal prefix ≠ argv hardening | security.md, agent-contracts | argv arrays; curl restrictions for verify agent |
| P0 | Missing `FAILED → SUCCESS` on heal pass | workflow-dsl §5.2 | Add transition; dedup `heal:{te}:{failId}` |
| P0 | No FR-15 backoff in engine | workflow-dsl §7.2, §10 | `nextEligibleAt`, `[0, 30s, 120s]` |
| P0 | BLOCKED vs FAILED ambiguous | workflow-dsl, FR-15 | Normative exhaustion table |
| P0 | Eligibility uses Task not TaskExecution | workflow-dsl §10 | `latestTaskExecution(taskId).status` |
| P0 | API uses `taskId` vs `taskExecutionId` | ADD §5.3, workflow-engine | Standardize on `taskExecutionId` |
| P0 | Custom engine "~500 lines" | ADD §6.2 | Qualify scope estimate |
| P0 | AgentContext full artifact content | agent-contracts, agent-framework | Summary-only + FR-19 note |
| P0 | Git MCP push/merge for agents | agent-contracts | Explicit denylist |
| P0 | Deploy approval token binding | ADD §10, security.md | Schema for approval JWT claims |

### P1 Backlog (Deduped)

- FR-19 context bundle assembly in ADD (retrieval pipeline unspecified)
- Split topology auth: Worker → Docker Agent Runtime connectivity
- Workflow versioning on re-plan (deferred P2 in ADD)
- Temporal migration ADR when multi-region sagas emerge
- Instrument heal/verify loops in monitoring.md
- Secret scan in merge gate (FR-10 — spec exists, impl pending)
- PR-based git workflow, visual regression (future)

---

## Recommended Implementation Sequence

```
1. JSON schemas (requirements/schemas/)           ← machine contracts
2. P0 doc fixes (this pass)                     ← normative closure
3. Local Compose spike                          ← engine + CRM DAG sim, no LLM
4. Workflow Engine core                         ← transitions, schedule, heal
5. Re-run five-lens review on implementation
6. MCP/ACP layer → reference CRM E2E
```

Do not expose `/internal/*` beyond localhost until service JWT is enforced.

---

## Skeptic Tier 0 — Optional Demo Path

If timeline dominates scope, use this **reduced demo path** (not the full factory):

| Cut | Rationale |
|-----|-----------|
| Pre-seed CRM artifacts (`requirements.md`, `openapi.yaml`, partial code) | Skip FR-02–04 LLM cost |
| Serial git — one task at a time on `mission/{id}` | Avoid merge gate complexity |
| Cloudflare staging only (no Docker target) | Single deploy path |
| `maxRetries: 1`, minimal heal loop | Prove schedule + verify, not FR-14 depth |
| Colocate orchestrator + agents in Compose | Defer Worker ↔ Docker split auth |
| Skip Web/Context7 MCP stubs | Research agent reads local docs only |

Full factory path still requires schemas, healing contract, and internal auth before production.

---

## P0 Remediation Status (This Pass)

| Fix | Files Updated |
|-----|---------------|
| Cross-review synthesis | `docs/reviews/cross-review-synthesis.md` |
| Planner merge + healing ingress + backoff | `workflow-dsl.md`, `ADD.md` |
| Requirements reconciliation | `02-proposed-architecture.md`, `01-core-concepts.md`, `workflow-engine.md`, `agent-framework.md`, `FR-14` |
| Security hardening | `security.md`, `mcp-integration.md`, `ADD.md`, `agent-contracts.md` |
| JSON schemas | `requirements/schemas/*.json` |
| Fixture + review status | `reference-crm-mission.md`, `docs/README.md` |

---

## Documents Reviewed

### Engineering Contracts

- [ADD.md](../ADD.md)
- [workflow-dsl.md](../workflow-dsl.md)
- [agent-contracts.md](../agent-contracts.md)
- [docs/README.md](../README.md)

### Requirements (cross-check)

- [requirements/reviews/cross-review-synthesis.md](../../requirements/reviews/cross-review-synthesis.md) — prior baseline
- Foundation, FR-01–FR-20, framework/, fixtures/
