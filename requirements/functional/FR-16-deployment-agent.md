# FR-16 — Deployment Agent

## Summary

The Deployment Agent must autonomously deploy completed applications to configured target environments — **Cloudflare and Docker for v1** — using infrastructure artifacts and mission constraints.

> **Platform vs. deploy target (v1):** The ASF platform (Mission Manager, Workflow Engine, state store) runs **locally** on the operator machine — CLI + engine + SQLite. It does **not** run on Cloudflare in v1. The Deployment Agent deploys **user-built applications** (Workers, Pages, D1, containers) to Cloudflare or Docker; Cloudflare APIs are an outbound integration, not the ASF runtime host.

## User Story

> As a user, I want my application automatically deployed to the environment I specified so that I receive a live URL without manual DevOps steps.

## System Story

> As the Deployment Agent, I must read architecture and infra artifacts, select the appropriate deployment strategy for the mission's `constraints.deployment` target, execute deployment commands, and report deployment URLs and status.

## Requirements

1. The Deployment Agent MUST support the following **v1 targets** (MUST implement):

| Target | Method | Artifacts |
|--------|--------|-----------|
| `cloudflare` | Workers, Pages, D1 migrations | `wrangler.toml`, build output |
| `docker` | Docker Compose / Dockerfile | `Dockerfile`, `docker-compose.yml` |

2. The following targets are **out of scope for v1** (SHOULD NOT be implemented until post-v1; see [future/future-enhancements.md](../future/future-enhancements.md)):

| Target | Status |
|--------|--------|
| `kubernetes` | Future — kubectl apply, manifests in `k8s/` |
| `vps` | Future — SSH + systemd or deploy script |
| `aws` | Future — CDK/CloudFormation or CLI |
| `azure` | Future — ARM/Bicep or CLI |
| `gcp` | Future — Cloud Run / GKE |

3. Deployment MUST be scheduled only after all implementation and test tasks for the deploy phase are `SUCCESS`.
4. The agent MUST:
   - Build production artifacts (`bun run build`)
   - Run database migrations if applicable
   - Execute target-specific deploy command
   - Capture deployment output (URLs, resource IDs)
4. Deployment secrets MUST be injected from secure vault — never from codebase.
5. Deployment result MUST include:

```json
{
  "target": "cloudflare",
  "status": "deployed",
  "urls": {
    "web": "https://crm-abc.pages.dev",
    "api": "https://crm-api-abc.workers.dev"
  },
  "resources": [{ "type": "worker", "id": "crm-api" }],
  "deployedAt": "ISO-8601",
  "commit": "sha"
}
```

6. Failed deployment MUST emit FR-13 failure event with `deploy_failed` classification.
7. Deployment artifacts and logs MUST be stored: `artifacts/deployment/{taskId}.json`
8. Rollback strategy SHOULD be documented per target (v1: manual rollback via redeploy previous commit).
9. Staging deploy SHOULD precede production when `constraints.environment: staging+production`.
10. Agent MUST use deployment MCP tools exclusively for target API interactions.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Mission constraints (`deployment`) | YAML |
| Input | Infra artifacts | wrangler.toml, Dockerfiles, k8s manifests |
| Input | Built artifacts | dist/, build output |
| Output | Deployment report | JSON |
| Output | Live URLs | HTTPS endpoints |
| Output | Deployment logs | Text/JSON |

## Acceptance Criteria

- [ ] CRM mission deploys to Cloudflare when `deployment: cloudflare`
- [ ] Deployment report includes web and API URLs
- [ ] Failed `wrangler deploy` triggers failure detection
- [ ] Secrets not present in deployment logs
- [ ] Deployment only runs after tests pass
- [ ] Deployment report indexed in memory (FR-18)
- [ ] Verification task (FR-17) auto-scheduled on deploy success

## Dependencies

- FR-09, FR-07 — Implementation complete
- FR-12 — Tests passing
- FR-13 — Failure detection
- FR-17 — Verification follows deploy
- FR-18 — Deployment history
- [framework/mcp-integration.md](../framework/mcp-integration.md) — Deployment MCP
- [framework/security.md](../framework/security.md) — Prod approval gate, vault

## Non-Goals

- Blue-green or canary deployments (v1)
- Multi-region deployment
- Custom domain DNS provisioning (manual or future)
- Cost estimation before deploy

## Open Questions

1. Default Cloudflare setup: Workers + Pages monorepo or separate?
2. Who provisions cloud accounts — user pre-configures credentials?
3. Automatic rollback on verification failure?

## Examples

**Cloudflare deployment command sequence:**

```yaml
deploy:
  target: cloudflare
  steps:
    - command: bun run build
    - command: bunx wrangler d1 migrations apply crm-db --remote
    - command: bunx wrangler deploy --env staging
    - command: bunx wrangler pages deploy dist --project-name crm-web
```

**Deployment report:**

```json
{
  "taskId": "t-deploy",
  "target": "cloudflare",
  "status": "deployed",
  "urls": {
    "web": "https://crm-staging.pages.dev",
    "api": "https://crm-api-staging.workers.dev"
  },
  "commit": "abc1234",
  "deployedAt": "2026-06-22T16:00:00Z"
}
```
