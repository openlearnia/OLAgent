# FR-13 — Failure Detection

## Summary

ASF must automatically detect failures across build, test, deployment, and runtime domains, classify them, and emit structured failure events that trigger the self-healing loop or retry policy.

## User Story

> As the ASF platform, I need to know immediately when something breaks so that autonomous recovery can begin without waiting for human observation.

## System Story

> As the Failure Detection system, I must monitor agent outputs, test results, build commands, deployment status, and browser console errors, normalize them into failure events, and route them to the appropriate handler.

## Requirements

1. Failure detection MUST cover four domains:

| Domain | Sources | Examples |
|--------|---------|----------|
| Build | `bun run build`, `tsc`, bundler | Compile errors, missing modules |
| Test | FR-12 results | Assertion failures, timeouts |
| Deployment | FR-16 output | Deploy command exit code, health check failure |
| Runtime | Browser console, API 5xx, logs | JS exceptions, unhandled rejections |

2. Each failure MUST produce a **Failure Event**:

```json
{
  "id": "fail-uuid",
  "missionId": "m-...",
  "taskId": "t-...",
  "domain": "test",
  "severity": "error",
  "classification": "assertion_failure",
  "message": "Expected 200, received 404",
  "source": { "file": "contacts.test.ts", "line": 42 },
  "stackTrace": "...",
  "timestamp": "ISO-8601",
  "recoverable": true
}
```

3. Failure classifications MUST include at minimum:
   - `compile_error`, `lint_error`, `assertion_failure`, `timeout`, `dependency_missing`
   - `deploy_failed`, `health_check_failed`, `dns_error`
   - `runtime_exception`, `api_error`, `auth_failure`, `network_error`
4. The system MUST determine `recoverable: boolean` based on classification heuristics.
5. Non-recoverable failures (e.g., `dns_error` for unconfigured domain) MUST set task `BLOCKED`.
6. Failure events MUST be persisted and indexed in memory (FR-18).
7. Detection MUST occur within 5 seconds of failure signal (test runner exit, deploy command return).
8. Multiple failures from one task execution MUST be grouped into a Failure Report artifact.
9. Failure detection MUST NOT swallow errors — all stderr/stdout from failed commands captured.
10. UI MUST surface active failures with classification and source location.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Test results (FR-12) | JSON |
| Input | Build command exit codes | Process output |
| Input | Deployment status (FR-16) | JSON |
| Input | Browser console logs (FR-11) | JSON |
| Output | Failure events | JSON stream |
| Output | `artifacts/failure-reports/{taskId}.json` | Aggregated report |

## Acceptance Criteria

- [ ] Compile error in `bun run build` produces `compile_error` event
- [ ] Test assertion failure produces `assertion_failure` with file/line
- [ ] Deploy non-zero exit code produces `deploy_failed` event
- [ ] Browser JS error produces `runtime_exception` event
- [ ] Non-recoverable DNS failure sets task `BLOCKED`
- [ ] Failure report artifact generated per failed task execution
- [ ] Self-healing loop (FR-14) triggered for recoverable failures

## Dependencies

- FR-12 — Test failures
- FR-16 — Deployment failures
- FR-11 — Runtime/browser errors
- FR-14 — Self-healing consumer
- FR-15 — Retry policy consumer
- FR-18 — Persistence

## Non-Goals

- Anomaly detection / ML-based classification (v1: rule-based)
- External monitoring integration (Datadog, Sentry) — future
- Performance regression detection

## Open Questions

1. Severity levels: warn vs. error — does warn trigger self-healing?
2. Failure deduplication across retries?
3. Alerting webhooks for blocked missions?

## Examples

**Failure event from test:**

```json
{
  "id": "fail-a1b2c3d4",
  "missionId": "m-7f3a2b1c",
  "taskId": "t-test-contacts",
  "domain": "test",
  "severity": "error",
  "classification": "assertion_failure",
  "message": "expect(received).toBe(200) // Received: 404",
  "source": {
    "file": "packages/api/src/routes/contacts.test.ts",
    "line": 28,
    "test": "GET /api/contacts returns 200"
  },
  "recoverable": true,
  "timestamp": "2026-06-22T14:30:00Z"
}
```

**Failure report artifact:**

```json
{
  "taskId": "t-test-contacts",
  "attempt": 1,
  "failureCount": 2,
  "failures": ["fail-a1b2c3d4", "fail-e5f6g7h8"],
  "summary": "2 test failures in contacts API tests"
}
```

---

## Appendix: Classification → Recoverable Decision Table

| Classification | Domain | Recoverable | Terminal Action |
|----------------|--------|-------------|-----------------|
| `compile_error` | build | yes | Retry → FR-14 fix |
| `lint_error` | build | yes | Retry → FR-14 fix |
| `assertion_failure` | test | yes | Retry → FR-14 fix |
| `timeout` | test / runtime | yes | Retry (FR-15); orphaned lease → same |
| `dependency_missing` | build | yes | Retry → fix agent installs dep |
| `deploy_failed` | deployment | yes | Retry deploy or FR-14 infra fix |
| `health_check_failed` | deployment | yes | Retry → FR-14 or redeploy |
| `runtime_exception` | runtime | yes | Retry → FR-14 fix |
| `api_error` | runtime | yes | Retry → FR-14 fix |
| `auth_failure` | runtime | yes | Retry → FR-14 fix (config/credentials) |
| `network_error` | runtime | conditional | Retry if transient; `BLOCKED` if persistent |
| `dns_error` | deployment | **no** | `BLOCKED` — requires human DNS config |
| `secret_leak_detected` | build | **no** | `BLOCKED` — rotate secrets, human review |
