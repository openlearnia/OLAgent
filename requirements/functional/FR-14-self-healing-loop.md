# FR-14 — Self-Healing Loop

## Summary

When recoverable failures are detected, ASF must autonomously execute a detect → analyze → fix → apply → retest cycle using the Fix Agent, attempting to resolve defects without human intervention before exhausting retry policy.

**v1 implementation:** Engine-owned `healing-child` subgraph per [docs/workflow-dsl.md §3.2](../../docs/workflow-dsl.md#32-healing-child). Canonical trigger is `completeTask` with `needsHealing: true`; `failure.detected` is audit-only.

## User Story

> As a user, I want ASF to fix its own mistakes when tests or builds fail, so that minor bugs don't block mission progress.

## System Story

> As the Self-Healing orchestrator, I must receive failure events, dispatch the Fix Agent with failure context, apply proposed fixes, re-run validation, and loop until success or retry exhaustion.

## Requirements

1. The self-healing loop MUST activate when FR-13 emits a failure with `recoverable: true`.
2. The loop stages:

```
DETECT → ANALYZE → FIX → APPLY → RETEST
   ↑                              |
   └──────── (fail) ──────────────┘
```

3. **DETECT:** Failure event received (FR-13).
4. **ANALYZE:** Fix Agent reads failure report, relevant source, test files, and memory of prior fixes for same task.
5. **FIX:** Fix Agent produces code changes addressing root cause (not symptom suppression).
6. **APPLY:** Changes committed via FR-10; workspace updated.
7. **RETEST:** Testing Agent (or inline test rerun) executes failed test suite minimum; full suite on final attempt.
8. Maximum loop iterations per task governed by FR-15 `maxRetries` (default: 3).
9. Fix Agent MUST NOT:
   - Delete tests to make them pass
   - Disable lint rules globally to suppress errors
   - Add `@ts-ignore` without documented justification
10. Each loop iteration MUST be logged with: iteration number, fix summary, retest result.
11. On loop success, original task marked `SUCCESS`; fix commits remain in history.
12. On loop exhaustion, task marked `FAILED` or mission `BLOCKED` per FR-15.
13. Self-healing MUST be idempotent — re-running on same failure should not corrupt state.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Failure event/report (FR-13) | JSON |
| Input | Source + test files | Workspace |
| Input | Prior fix attempts (memory) | FR-18 |
| Output | Fix commits | Git SHAs |
| Output | `artifacts/healing-log/{taskId}.json` | Iteration log |
| Output | Updated task status | Workflow state |

## Acceptance Criteria

- [ ] Injected off-by-one bug in contacts API fixed autonomously within 3 iterations
- [ ] Fix Agent does not delete failing tests (verified by policy check)
- [ ] Healing log records each iteration with fix summary
- [ ] Successful heal marks task `SUCCESS` and continues workflow (FR-20)
- [ ] Exhausted retries trigger FR-15 blocked/failed state
- [ ] Same failure after identical fix attempt flagged as non-progress (escalate)

## Dependencies

- FR-13 — Failure detection
- FR-15 — Retry limits
- FR-07 — Fix Agent execution
- FR-09 — Code fixes
- FR-10 — Fix commits
- FR-12 — Retest
- FR-18 — Prior attempt memory

## Non-Goals

- Fixing architectural/design flaws (requires replanning — future)
- Self-healing infrastructure/deployment provider outages
- Modifying requirements to match broken implementation

## Open Questions

1. Should Fix Agent have a separate LLM model tuned for debugging?
2. Rollback fix commit if retest still fails before next iteration?
3. Human notification on each healing iteration or only on exhaustion?

## Examples

**Healing loop state:**

```yaml
healing:
  taskId: t-test-contacts
  iteration: 2
  maxRetries: 3
  stage: RETEST
  failure:
    classification: assertion_failure
    message: "Expected 200, received 404"
  fix:
    agentId: a-fix-002
    summary: "Added missing route registration in app.ts"
    commit: "def5678"
```

**Healing log excerpt:**

```json
{
  "taskId": "t-test-contacts",
  "iterations": [
    {
      "n": 1,
      "failure": "404 on GET /api/contacts",
      "fix": "Created contacts router file but forgot to mount in app.ts",
      "commit": "abc1234",
      "retest": "fail",
      "newFailure": "500 internal server error"
    },
    {
      "n": 2,
      "failure": "500 on GET /api/contacts",
      "fix": "Fixed Drizzle query using wrong column name",
      "commit": "def5678",
      "retest": "pass"
    }
  ],
  "outcome": "healed"
}
```
