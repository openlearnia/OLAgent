# FR-17 — Deployment Verification

## Summary

After deployment, ASF must autonomously verify the live application is reachable, APIs are healthy, the UI is accessible, and authentication flows work — before marking the mission successful.

## User Story

> As a user, I want confirmation that my deployed application actually works in production, not just that the deploy command succeeded.

## System Story

> As the Deployment Verification agent/process, I must run health checks, API smoke tests, browser UI flows, and auth validation against deployed URLs, producing a verification report that gates mission completion.

## Requirements

1. Verification MUST run automatically after FR-16 reports `deployed` status (via `verify-deployment` task, FR-05).
2. Mission `constraints.verification` MAY specify:

```yaml
constraints:
  verification:
    requireAuth: true          # auth_working check required
    primaryResource: contacts  # api_smoke CRUD target
    healthPath: /api/health    # override default health endpoint
    allowedHosts:              # browser URL allowlist (see security.md)
      - crm-staging.pages.dev
      - crm-api-staging.workers.dev
```

3. Verification checks (all MUST pass for mission `SUCCESS`):

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Reachability | HTTP GET to web URL | Status 200, response < 10s |
| API health | GET `/health` or `/api/health` | Status 200, body indicates healthy |
| API smoke | CRUD on primary resource | Create + read succeeds per OpenAPI |
| UI accessible | Browser MCP navigate to web URL | Page loads, no console errors |
| Auth working | Browser login flow | Login succeeds, protected route accessible |

4. **Smoke data cleanup (MUST):** When `api_smoke` creates test records in staging, the verification agent MUST delete them before marking the task `SUCCESS`. Required for staging; production smoke data creation is prohibited unless operator-approved.

5. Verification MUST use deployment URLs from FR-16 report.
6. Test credentials MUST come from secure test account provisioning (not hardcoded in repo).
7. Verification report MUST include:

```json
{
  "status": "verified" | "failed",
  "checks": [
    { "name": "reachability", "passed": true, "duration_ms": 450 },
    { "name": "api_health", "passed": true, "duration_ms": 120 },
    { "name": "api_smoke", "passed": true, "duration_ms": 890 },
    { "name": "ui_accessible", "passed": true, "duration_ms": 2100 },
    { "name": "auth_working", "passed": true, "duration_ms": 3400 }
  ],
  "screenshots": ["artifacts/screenshots/verify-dashboard.png"],
  "verifiedAt": "ISO-8601"
}
```

8. Any failed check MUST trigger FR-13 with appropriate classification.
9. Failed verification SHOULD attempt self-healing (FR-14) if failure is in application code; redeploy if infra issue.
10. Verification artifacts stored: `artifacts/verification/{missionId}.json`
11. Mission Manager MUST NOT set `SUCCESS` until verification `status: verified` and `verify-deployment` task is `SUCCESS`.
12. Verification MUST be repeatable via manual trigger from UI (re-verify button).

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Deployment report (FR-16) | JSON with URLs |
| Input | `openapi.yaml` | API smoke test contract |
| Input | Test credentials | Vault-injected |
| Output | Verification report | JSON |
| Output | Screenshots | PNG |
| Output | Mission terminal status | SUCCESS or BLOCKED/FAILED |

## Acceptance Criteria

- [ ] Deployed CRM passes all five verification checks
- [ ] Unreachable URL fails reachability check within timeout
- [ ] Broken auth fails `auth_working` with clear error
- [ ] Mission remains `RUNNING` until verification passes
- [ ] Verification report visible in Mission Dashboard
- [ ] Re-verify button works from UI
- [ ] Smoke test data cleaned up after verification on staging

## Dependencies

- FR-16 — Deployment URLs
- FR-11 — Browser verification
- FR-12 — API test patterns
- FR-13, FR-14 — Failure handling
- FR-05 — `verify-deployment` task definition
- FR-07 — `verification` agent type
- [framework/security.md](../framework/security.md) — URL allowlist, vault credentials

## Non-Goals

- Full regression test suite in production (smoke only)
- SSL certificate provisioning verification
- Performance/load verification
- Third-party integration verification (email sending, etc.)

## Open Questions

1. Verify against staging only, or also production in same mission?
2. Seed test data in production for smoke tests?
3. Verification frequency post-mission (ongoing monitoring)?

## Examples

**Verification flow:**

```yaml
verify:
  mission_id: m-7f3a2b1c
  urls:
    web: https://crm-staging.pages.dev
    api: https://crm-api-staging.workers.dev
  checks:
    - name: reachability
      request: GET ${urls.web}
      expect: { status: 200 }
    - name: api_health
      request: GET ${urls.api}/health
      expect: { status: 200, body.contains: "ok" }
    - name: api_smoke
      steps:
        - POST ${urls.api}/api/contacts { name: "Verify", email: "v@test.com" }
        - GET ${urls.api}/api/contacts
        - expect: body contains "Verify"
        - DELETE ${urls.api}/api/contacts/{id}  # cleanup required
    - name: ui_accessible
      browser: { navigate: ${urls.web}, expect_no_console_errors: true }
    - name: auth_working
      browser: { flow: login.yaml, then_navigate: /contacts }
```

**Failed verification example:**

```json
{
  "status": "failed",
  "checks": [
    { "name": "reachability", "passed": true },
    { "name": "auth_working", "passed": false, "error": "Login redirect loop detected" }
  ]
}
```
