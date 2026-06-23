# ASF Agent Contracts v1

**Version:** 1.0.0  
**Status:** Engineering-ready  
**Date:** 2026-06-22

Per-type execution contracts for all v1 agents. Contracts are pinned at mission start (`mission.contractVersions`) and referenced by the Agent Runtime when spawning ACP sessions.

### Runtime binding

Contracts are enforced by **`asf agent run`** ([agent-runtime.md](./agent-runtime.md)):

- **Load:** Context Bundle → `AgentContext` + contract version lookup
- **Sandbox:** Process-per-session in v1 ([process-sandbox.md](../requirements/framework/process-sandbox.md)); optional container-per-session in Phase 2 — MCP Proxy enforces `tools.allowlist` / `denylist` and global policies §1.2 at filesystem, git, terminal, browser, and vault boundaries
- **Complete:** Assembled `AgentResult` → `POST /internal/v1/tasks/:taskExecutionId/complete` (agents never write task state directly)

Operator CLI surface: [cli-reference.md](./cli-reference.md).

---

## 1. Contract Template

Each agent type document section follows this structure:

```yaml
agent:
  type: <agent-type>
  version: "1.0.0"
  description: <one line>
  timeout_ms: <wall-clock max>
  max_concurrent: <per mission>
  inputs:
    contextBundle: AgentContext  # FR-19
    requiredArtifacts: [<paths>]
  outputs:
    result: AgentResult
    requiredArtifacts: [<paths>]
  tools:
    allowlist: [<mcp-server.tool>]
    denylist: [<explicit blocks>]
  policies:
    - <enforceable rule>
```

### 1.1 Shared Types

```typescript
interface AgentContext {
  mission: {
    id: string;
    goal: string;
    constraints: Record<string, unknown>;
  };
  task: {
    id: string;
    type: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    dependencies: string[];
    attempt: number;
    parentTaskId?: string;
  };
  artifacts: Array<{ path: string; summary?: string }>;  // paths + optional summary; full content via FR-19 retrieval at runtime
  memory: Array<{ kind: string; content: string; relevance: number }>;
  priorFailures: FailureReport[];
  workspace: string; // absolute path to workspaces/{missionId}
}

interface AgentResult {
  status: "COMPLETED" | "FAILED";
  artifacts: string[];
  commits: string[];
  summary: string;
  needsHealing?: boolean;  // signal FR-14; engine spawns healing-child
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
    classification?: string; // FR-13
  };
  metrics?: {
    tokenUsage: { input: number; output: number };
    durationMs: number;
  };
}
```

### 1.2 Global Policies (All Agents)

1. MUST NOT write outside `workspace` (MCP enforced).
2. MUST NOT read secrets from files; credentials via vault-injected MCP only.
3. MUST call `completeTask` outcome via Agent Runtime (not direct DB).
4. MUST heartbeat every 30s while `RUNNING`.
5. MUST use conventional commit format (FR-10) when committing.
6. On ambiguous requirements with no path forward → `FAILED` + `recoverable: false` or request `BLOCKED` via engine.

### 1.3 Git MCP Global Denylist (All Agents)

Agents MUST NOT invoke:

- `git.push`, `git.merge`, `git.reset`, `git.rebase`, `git.force-push`

Merge to `mission/{missionId}` is performed by Workflow Engine merge gates only.

---

## 2. `planner`

**Version:** 1.0.0  
**FR:** FR-05  
**Timeout:** 3,600,000 ms (1 hour)  
**Max concurrent:** 1 per mission

### Inputs

| Field | Required |
|-------|----------|
| `requirements.md` | ✅ |
| `architecture.md` | ✅ |
| `database-schema.md` | ✅ |
| `openapi.yaml` | ✅ |
| `research-report.md` | ✅ |

### Outputs

| Artifact | Required |
|----------|----------|
| `tasks/plan.json` | ✅ |
| `planning-report.md` | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list`, `exists` |
| memory | `commit`, `search`, `get`, `list_recent` |

### Denylist

- git `merge`, deployment `deploy`, terminal `exec` (read-only planning)

### Policies

1. MUST emit `verify-deployment` task after `deploy`.
2. MUST set `parallelSafe: false` on shared-surface tasks by default.
3. MUST NOT execute implementation tasks.
4. Task count SHOULD be ≥ 10 for non-trivial missions.

### Example Result

```json
{
  "status": "COMPLETED",
  "artifacts": ["tasks/plan.json", "planning-report.md"],
  "commits": ["plan123"],
  "summary": "Emitted 14 tasks; critical path through t-contacts-api"
}
```

---

## 3. `requirement-discovery`

**Version:** 1.0.0  
**FR:** FR-02  
**Timeout:** 2,700,000 ms (45 min)  
**Max concurrent:** 1

### Inputs

| Field | Required |
|-------|----------|
| Mission goal + constraints | ✅ |
| User reference files | Optional |

### Outputs

| Artifact | Required |
|----------|----------|
| `requirements.md` | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list` |
| memory | `commit`, `search` |
| web | `search`, `fetch` |

### Policies

1. MUST NOT produce architecture or code.
2. Requirements MUST use IDs `REQ-F-NNN`.
3. Critical ambiguity → `FAILED` with `recoverable: false` and open questions in artifact.

---

## 4. `research`

**Version:** 1.0.0  
**FR:** FR-03  
**Timeout:** 2,700,000 ms  
**Max concurrent:** 1

### Inputs

| Field | Required |
|-------|----------|
| `requirements.md` | ✅ |
| Mission goal | ✅ |

### Outputs

| Artifact | Required |
|----------|----------|
| `research-report.md` | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list` |
| memory | `commit`, `search` |
| web | `search`, `fetch` |
| context7 | `resolve_library`, `get_docs` |

### Policies

1. MUST cite sources in report.
2. MUST NOT make final architecture decisions (defer to architect).

---

## 5. `architect`

**Version:** 1.0.0  
**FR:** FR-04  
**Timeout:** 3,600,000 ms  
**Max concurrent:** 1

### Inputs

| Field | Required |
|-------|----------|
| `requirements.md` | ✅ |
| `research-report.md` | ✅ |

### Outputs

| Artifact | Required |
|----------|----------|
| `architecture.md` | ✅ |
| `database-schema.md` | ✅ |
| `openapi.yaml` | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list` |
| memory | `commit`, `search` |

### Policies

1. `openapi.yaml` MUST be OpenAPI 3.1 valid.
2. MUST NOT write implementation code.
3. MUST include ADR-style decisions in `architecture.md`.

---

## 6. `backend-engineer`

**Version:** 1.0.0  
**FR:** FR-09  
**Timeout:** 7,200,000 ms (2 hours)  
**Max concurrent:** 2

### Inputs

| Field | Required |
|-------|----------|
| `openapi.yaml` | ✅ |
| `database-schema.md` | ✅ |
| Task description + acceptance criteria | ✅ |

### Outputs

| Artifact | Required |
|----------|----------|
| Source files per task | ✅ |
| Unit tests for changed code | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list`, `delete` |
| git | `status`, `diff`, `add`, `commit`, `branch`, `checkout`, `log` |
| terminal | `exec` (allowlisted prefixes) |
| memory | `commit`, `search`, `get` |
| database | `query`, `migrate`, `schema` |

### Denylist

- `deployment.deploy`
- browser tools
- git `merge` (engine merge gate)

### Policies

1. MUST checkout `task/{taskId}` branch.
2. MUST align with `openapi.yaml` contract.
3. Test failures → `needsHealing: true` if recoverable.

---

## 7. `frontend-engineer`

**Version:** 1.0.0  
**FR:** FR-09  
**Timeout:** 7,200,000 ms  
**Max concurrent:** 2

### Inputs

| Field | Required |
|-------|----------|
| `architecture.md` | ✅ |
| `openapi.yaml` | ✅ |
| Task description | ✅ |

### Outputs

| Artifact | Required |
|----------|----------|
| UI source files | ✅ |
| Component tests where applicable | Optional |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list`, `delete` |
| git | `status`, `diff`, `add`, `commit`, `branch`, `checkout`, `log` |
| terminal | `exec` |
| memory | `commit`, `search`, `get` |
| browser | `page_navigate`, `page_find`, `page_click`, `page_text`, `page_type`, `page_screenshot`, `page_elements`, `page_network`, `page_console`, `page_wait`, `browser_launch`, `browser_close` |

### Policies

1. Browser use limited to local dev URLs during implementation.
2. MUST NOT deploy to staging/production.

---

## 8. `infra-engineer`

**Version:** 1.0.0  
**FR:** FR-09, FR-16 (setup)  
**Timeout:** 7,200,000 ms  
**Max concurrent:** 1

### Inputs

| Field | Required |
|-------|----------|
| `architecture.md` | ✅ |
| Mission constraints | ✅ |

### Outputs

| Artifact | Required |
|----------|----------|
| `wrangler.toml`, Dockerfiles, CI config | Per task |
| Repo structure (`setup-repo`) | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list`, `delete` |
| git | full except `merge` |
| terminal | `exec` |
| memory | `commit`, `search` |
| deployment | `status`, `logs` (read-only during setup) |

### Policies

1. `setup-repo` MUST produce valid Bun monorepo per mission constraints.
2. MUST NOT run production deploy.

---

## 9. `testing`

**Version:** 1.0.0  
**FR:** FR-12  
**Timeout:** 3,600,000 ms  
**Max concurrent:** 2

### Inputs

| Field | Required |
|-------|----------|
| Source tree | ✅ |
| Task acceptance criteria | ✅ |
| Prior failure reports (heal-retest) | Optional |

### Outputs

| Artifact | Required |
|----------|----------|
| Test files (`write-tests`) | Conditional |
| `artifacts/test-results/{taskId}.json` | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list` |
| git | `status`, `diff`, `log`, `add`, `commit` |
| terminal | `exec` (`bun test`, `bun run`, etc.) |
| browser | `page_navigate`, `page_find`, `page_click`, `page_text`, `page_type`, `page_screenshot`, `page_elements`, `page_network`, `page_console`, `page_wait`, `browser_launch`, `browser_close` |
| memory | `commit`, `search`, `get` |

### Policies

1. MUST NOT delete failing tests to pass.
2. On failure → `needsHealing: true`, `recoverable: true` for assertion/build failures.
3. `heal-retest` runs minimum failed suite; full suite on final parent attempt.

### Example Failure Result

```json
{
  "status": "FAILED",
  "artifacts": ["artifacts/test-results/t-browser.json"],
  "commits": [],
  "summary": "Browser E2E failed: login button not found",
  "needsHealing": true,
  "error": {
    "code": "TEST_FAILURE",
    "message": "page_find login returned 0 matches",
    "recoverable": true,
    "classification": "assertion_failure"
  }
}
```

---

## 10. `fix`

**Version:** 1.0.0  
**FR:** FR-14  
**Timeout:** 3,600,000 ms  
**Max concurrent:** 2

### Inputs

| Field | Required |
|-------|----------|
| `artifacts/failure-reports/{parentTaskId}.json` | ✅ |
| Relevant source + test files | ✅ |
| Prior healing memory | ✅ |

### Outputs

| Artifact | Required |
|----------|----------|
| Fix commits | ✅ |
| `artifacts/healing-log/{parentTaskId}.json` (append) | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write`, `list` |
| git | `status`, `diff`, `add`, `commit`, `log` |
| terminal | `exec` |
| memory | `commit`, `search`, `get` |

### Denylist

- browser (retest is separate task)
- deployment

### Policies

1. MUST NOT delete tests, disable lint globally, or add `@ts-ignore` without justification comment.
2. MUST address root cause per failure classification.
3. Returns `COMPLETED` after commit; engine schedules `heal-retest`.

---

## 11. `deployment`

**Version:** 1.0.0  
**FR:** FR-16  
**Timeout:** 3,600,000 ms  
**Max concurrent:** 1

### Inputs

| Field | Required |
|-------|----------|
| Built artifacts | ✅ |
| `wrangler.toml` or Docker config | ✅ |
| Mission `constraints.deployment` | ✅ |

### Outputs

| Artifact | Required |
|----------|----------|
| `artifacts/deployment/{taskId}.json` | ✅ |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `list` |
| git | `status`, `log` |
| terminal | `exec` (`wrangler`, `docker`, `bun run build`) |
| deployment | `deploy`, `status`, `logs` |

### Policies

1. v1 targets: **cloudflare**, **docker** only.
2. Production deploy MUST fail without operator approval (`DEPLOY_APPROVAL_REQUIRED`).
3. Secrets via vault injection only.
4. MUST run `bun run build` before deploy.

### Deployment Report Shape

```json
{
  "target": "cloudflare",
  "status": "deployed",
  "urls": { "web": "https://...", "api": "https://..." },
  "commit": "sha",
  "deployedAt": "ISO-8601"
}
```

---

## 12. `verification`

**Version:** 1.0.0  
**FR:** FR-17  
**Timeout:** 2,700,000 ms  
**Max concurrent:** 1

### Inputs

| Field | Required |
|-------|----------|
| `artifacts/deployment/{deployTaskId}.json` | ✅ |
| `openapi.yaml` | ✅ |
| `constraints.verification` | ✅ |
| Vault test credentials | Injected at MCP |

### Outputs

| Artifact | Required |
|----------|----------|
| `artifacts/verification/{missionId}.json` | ✅ |
| Screenshots | Optional |

### Tool Allowlist

| Server | Tools |
|--------|-------|
| filesystem | `read`, `write` |
| browser | `page_navigate`, `page_find`, `page_click`, `page_text`, `page_type`, `page_screenshot`, `page_elements`, `page_network`, `page_console`, `page_wait`, `browser_launch`, `browser_close` |

### Policies

1. MUST run all five FR-17 checks: reachability, api_health, api_smoke, ui_accessible, auth_working.
2. MUST delete smoke test data before `COMPLETED`.
3. Mission SUCCESS blocked until `status: verified`.
4. Browser URLs MUST pass security allowlist.
5. Prefer browser MCP for HTTP/API checks; `curl` via terminal only when explicitly allowlisted with URL host restrictions matching deployment URLs.
6. On failure → `needsHealing: true` if application bug; `recoverable: false` for DNS/infra.

### Example Success Result

```json
{
  "status": "COMPLETED",
  "artifacts": [
    "artifacts/verification/m-7f3a2b1c.json",
    "artifacts/screenshots/verify-dashboard.png"
  ],
  "commits": [],
  "summary": "All FR-17 checks passed; smoke data cleaned up"
}
```

---

## 13. Contract Registry Summary

| Type | Version | Timeout | Max Concurrent | Primary FR |
|------|---------|---------|----------------|------------|
| planner | 1.0.0 | 1h | 1 | FR-05 |
| requirement-discovery | 1.0.0 | 45m | 1 | FR-02 |
| research | 1.0.0 | 45m | 1 | FR-03 |
| architect | 1.0.0 | 1h | 1 | FR-04 |
| backend-engineer | 1.0.0 | 2h | 2 | FR-09 |
| frontend-engineer | 1.0.0 | 2h | 2 | FR-09 |
| infra-engineer | 1.0.0 | 2h | 1 | FR-09 |
| testing | 1.0.0 | 1h | 2 | FR-12 |
| fix | 1.0.0 | 1h | 2 | FR-14 |
| deployment | 1.0.0 | 1h | 1 | FR-16 |
| verification | 1.0.0 | 45m | 1 | FR-17 |

---

## 14. MCP Tool Matrix (Quick Reference)

| Tool / Server | planner | req-disc | research | architect | backend | frontend | infra | testing | fix | deploy | verify |
|---------------|---------|----------|----------|-----------|---------|----------|-------|---------|-----|--------|--------|
| filesystem | RW | RW | RW | RW | RW | RW | RW | RW | RW | R | RW |
| git | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | R | — |
| terminal | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| memory | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| database | — | — | — | — | ✓ | — | — | — | — | — | — |
| browser | — | — | — | — | — | ✓ | — | ✓ | — | — | ✓ |
| deployment | — | — | — | — | — | — | R | — | — | ✓ | — |
| web | — | ✓ | ✓ | — | — | — | — | — | — | — | — |
| context7 | — | — | ✓ | — | — | — | — | — | — | — | — |

Legend: RW = read/write filesystem; ✓ = subset per section; R = read-only.

---

## Related Documents

- [agent-runtime.md](./agent-runtime.md) — `asf agent run` sequence, sandbox enforcement, heartbeat
- [cli-reference.md](./cli-reference.md) — operator CLI and `agent run` flags
- [ADD.md](./ADD.md)
- [workflow-dsl.md](./workflow-dsl.md)
- [requirements/functional/FR-07-agent-execution.md](../requirements/functional/FR-07-agent-execution.md)
- [requirements/framework/security.md](../requirements/framework/security.md)
