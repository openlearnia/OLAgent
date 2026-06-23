# ASF-FUTURE — Future Enhancements

## Summary

This document catalogs capabilities explicitly out of scope for ASF v1 but planned for subsequent releases. These items inform architectural decisions now to avoid painting into corners, without committing to implementation timelines.

## User Story

> As a product owner, I want a clear roadmap of what ASF will become so that v1 architecture doesn't block future capabilities.

---

## Cloudflare-Hosted Platform Orchestrator

**Description:** Run the ASF control plane on Cloudflare — Mission Manager API and Workflow Engine on Workers, event queue and lease sweeper on Durable Objects, durable state on D1, static Mission Dashboard on Pages. Agent Runtime remains on an operator Docker host (Workers cannot host containers).

**Why deferred:** v1 is **local-first**: CLI + engine + SQLite on one machine. Cloudflare integration in v1 is limited to **deploying generated user apps** (FR-16), not hosting the orchestrator.

**Design hooks for v1 (avoid painting into corners):**
- `constraints.runtime: local | cloud` in mission schema — v1 defaults to `local`; `cloud` reserved for future hosted platform
- Internal API and event contracts should not assume localhost-only (service JWT, idempotent `completeTask` keys)
- D1/SQLite swap already contemplated in ADD §11.2 — same schema, different backend
- Agent Runtime split: Worker schedules; Docker host executes ACP sessions (topology unchanged from future model)

---

## Multi-Repo Missions

**Description:** A single mission spanning multiple git repositories — e.g., a frontend repo, backend repo, and shared library repo deployed together.

**Why deferred:** v1 focuses on single-repo missions to simplify workspace isolation, git strategy, and dependency management.

**Design considerations for v1:**
- Mission workspace structure should allow multiple repo roots
- Git MCP should not assume single repo root
- Task planner should support cross-repo dependency edges

---

## Multi-Project Programs

**Description:** A program groups related missions (e.g., "CRM v1", "CRM mobile app", "CRM analytics dashboard") with shared memory, coordinated releases, and cross-mission dependencies.

**Why deferred:** Requires program-level orchestration above mission manager.

**Design considerations:**
- Memory system should use hierarchical scoping: program → mission
- UI needs program dashboard above mission dashboard

---

## Agent Marketplace

**Description:** Third-party and community-contributed agent types installable into ASF — custom specialists for domains like ML, blockchain, or specific frameworks.

**Why deferred:** Requires agent contract registry, sandboxing, versioning, and trust model.

**Design considerations:**
- Agent contracts already versioned (framework/agent-framework.md)
- MCP tool allowlists per agent type support custom profiles
- Plugin manifest format TBD

---

## Cost Optimization

**Description:** Intelligent token budget management — model routing (cheaper models for simple tasks), context compression, caching of retrieval results, and mission-level spend caps with auto-pause.

**Why deferred:** v1 prioritizes correctness over cost; basic token tracking exists in monitoring.

**Design considerations:**
- `constraints.budget` placeholder in FR-01
- Per-task token metrics already collected (monitoring)
- Retrieval token budgets in FR-19

---

## Security Audit Agent

**Description:** Autonomous security review — dependency vulnerability scanning, OWASP checks, secret detection, and security-focused code review before deployment.

**Why deferred:** v1 has basic secret scanning; comprehensive audit is a specialized agent type.

**Design considerations:**
- Add `security-auditor` agent type to FR-07 registry
- Schedule before deployment in workflow DAG
- Integrate semgrep MCP (available in environment)

---

## Performance Optimization Agent

**Description:** Autonomous performance analysis — bundle size analysis, query profiling, lighthouse audits, and optimization recommendations with optional auto-fix.

**Why deferred:** v1 focuses on functional correctness; performance is non-blocking.

**Design considerations:**
- Browser MCP can run lighthouse via terminal
- Metrics infrastructure supports performance histograms

---

## Autonomous Product Manager

**Description:** An agent that manages scope — prioritizes features, creates/amends requirements based on progress, communicates trade-offs, and decides what to cut when constraints bind.

**Why deferred:** v1 executes a fixed plan; scope changes require human mission amendment.

**Design considerations:**
- Requirement Discovery Agent (FR-02) is a precursor
- Re-planning hooks mentioned in FR-05 as future

---

## Autonomous QA Manager

**Description:** Beyond test execution — test strategy design, coverage gap analysis, flaky test quarantine, and quality gate enforcement with release recommendations.

**Why deferred:** FR-12 covers test execution; QA management is meta-orchestration.

**Design considerations:**
- Test results in memory (FR-18) enable coverage tracking
- Quality gates partially in FR-10 merge policy

---

## Autonomous Release Manager

**Description:** Manages release channels (staging → canary → production), changelog generation, semantic versioning, and coordinated multi-service releases.

**Why deferred:** v1 deploys to single target; release management is operational maturity.

**Design considerations:**
- Deployment agent (FR-16) supports staging+production sequence
- Git tagging on mission success (FR-10) is a precursor

---

## Additional Future Items

| Enhancement | Brief Description |
|-------------|-------------------|
| Kubernetes / VPS / AWS / Azure / GCP deployment | Multi-cloud deploy targets beyond v1 Cloudflare + Docker |
| Interactive clarification | Chat-based requirement refinement instead of BLOCKED |
| PR-based git workflow | GitHub PR creation and review instead of local merge |
| Visual regression testing | Pixel-diff screenshot comparison |
| Ongoing production monitoring | Post-mission health monitoring and auto-heal |
| Cross-mission knowledge transfer | Learn from prior missions with similar goals |
| Custom deployment targets | User-defined deployment MCP plugins |
| Agent execution replay | Replay ACP session telemetry for debugging |
| Mission templates | Pre-built mission.yaml templates for common app types |
| Webhook integrations | Slack/Discord notifications on mission events |
| Multi-tenant SaaS | User auth, billing, mission isolation at platform level |

---

## Prioritization Guidance (Non-Binding)

| Priority | Enhancement | Rationale |
|----------|-------------|-----------|
| P1 | Multi-repo missions | Common real-world need |
| P1 | Cost optimization | Operational necessity at scale |
| P1 | Security audit agent | Trust and safety |
| P2 | Agent marketplace | Ecosystem growth |
| P2 | Autonomous release manager | Production maturity |
| P2 | Cloudflare-hosted orchestrator | Hosted control plane without local CLI |
| P3 | Multi-project programs | Enterprise scale |
| P3 | Autonomous PM/QA | Advanced autonomy |

---

## Dependencies on v1

All future enhancements build on v1 foundations:

- Agent framework and contracts (framework/agent-framework.md)
- Workflow engine with durable state (framework/workflow-engine.md)
- MCP tool surface (framework/mcp-integration.md)
- Long-term memory (FR-18)
- Monitoring infrastructure (framework/monitoring.md)

## Non-Goals

This document does not commit to timelines, staffing, or detailed specifications. Each future item will receive its own FR document when prioritized for implementation.

## Open Questions

1. Which P1 item ships first after v1 GA?
2. Open-source agent marketplace vs. curated registry?
3. Enterprise features (SSO, audit) as separate tier?
