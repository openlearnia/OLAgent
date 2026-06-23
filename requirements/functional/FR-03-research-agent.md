# FR-03 — Research Agent

## Summary

The Research Agent searches external sources — documentation, GitHub repositories, technical articles — to gather implementation-relevant knowledge and produce a `research-report.md` that informs architecture and implementation decisions.

## User Story

> As a user, I want ASF to research best practices and existing solutions for my domain so that architectural and implementation choices are informed by current standards, not model training data alone.

## System Story

> As the Research Agent, I must query approved external sources based on mission goal and requirements, synthesize findings, cite sources, and write `research-report.md` with actionable recommendations for the Architecture Agent.

## Requirements

1. The agent MUST run after or in parallel with Requirement Discovery (FR-02), before Architecture (FR-04).
2. The agent MUST read `requirements.md` and mission constraints to scope research queries.
3. Research sources MUST include:
   - Official framework/library documentation (via Context7 MCP or web fetch)
   - GitHub repositories (similar projects, reference implementations)
   - Technical articles and blog posts (curated web search)
4. The agent MUST produce `research-report.md` containing:
   - Research objectives
   - Source bibliography with URLs and access dates
   - Technology recommendations aligned with mission constraints
   - Patterns to adopt and anti-patterns to avoid
   - Reference architecture sketches (descriptive, not final design)
   - Risks and unknowns
5. All recommendations MUST cite at least one source.
6. The agent MUST respect mission constraint `stack` — MUST NOT recommend technologies outside constraints unless flagged as alternatives.
7. Findings MUST be indexed in long-term memory (FR-18) with `kind: research`.
8. Network access MUST be sandboxed; only approved MCP tools used for fetching.
9. Research MUST complete within configurable timeout (default: 30 minutes wall-clock).

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | `requirements.md` | Markdown |
| Input | Mission constraints | YAML/JSON |
| Output | `research-report.md` | Markdown |
| Output | Memory entries | Tagged by topic (auth, database, deployment) |

## Acceptance Criteria

- [ ] CRM mission research report recommends Better Auth + D1 when constraints specify them
- [ ] Report includes ≥ 5 cited sources
- [ ] GitHub reference repos identified with license notes
- [ ] Architecture Agent (FR-04) can consume report without additional research
- [ ] Research completes within timeout or gracefully degrades with partial report + warning
- [ ] No credentials or API keys written to research artifacts

## Dependencies

- FR-02 — Requirements input
- FR-04 — Primary consumer
- FR-18, FR-19 — Memory
- [framework/mcp-integration.md](../framework/mcp-integration.md) — Web fetch, Context7

## Non-Goals

- Patent or trademark research
- Market sizing or business viability analysis
- Scraping paywalled content
- Continuous research updates after initial report

## Open Questions

1. Should research be re-run when requirements change materially?
2. Cache research results across missions with similar goals?
3. Allowlist for domains vs. open web search?

## Examples

**Research query plan (internal):**

```yaml
research_plan:
  mission_id: m-7f3a2b1c-...
  queries:
    - topic: crm-data-model
      sources: [github, articles]
    - topic: better-auth-cloudflare
      sources: [docs, github]
    - topic: react-crud-patterns
      sources: [docs, articles]
```

**Excerpt from `research-report.md`:**

```markdown
# Research Report — Small Business CRM

## Technology Recommendations

### Database: Cloudflare D1
**Rationale:** Mission constraint specifies `deployment: cloudflare`.
D1 provides SQLite-compatible edge storage with Workers integration.
**Source:** https://developers.cloudflare.com/d1/

### Auth: Better Auth
**Rationale:** TypeScript-native, supports email/password, integrates with
Hono/Workers patterns found in reference repos.
**Source:** https://www.better-auth.com/docs

## Reference Implementations
- `github.com/example/crm-starter` — MIT, Hono + React, last updated 2025-11
```
