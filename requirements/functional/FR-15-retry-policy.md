# FR-15 — Retry Policy

## Summary

ASF must enforce configurable retry limits per task and mission, tracking attempt counts, determining when to retry vs. block vs. fail, and preventing infinite self-healing loops.

## User Story

> As a user, I want ASF to try reasonable recovery attempts automatically but stop and ask for help when it can't fix a problem — not loop forever burning tokens.

## System Story

> As the Retry Policy engine, I must track per-task retry counts, compare against configured limits, gate self-healing and task re-execution, and transition missions to `BLOCKED` or `FAILED` when limits are exhausted.

## Requirements

1. Retry configuration MUST be settable at:
   - Mission level: `constraints.maxRetries` (default: 3)
   - Task level override: `task.maxRetries` (optional)
   - Global default: system config (default: 3)
   Priority: task > mission > global.
2. A **retry attempt** is counted when:
   - Self-healing loop iteration completes without retest pass (FR-14)
   - Task re-execution after agent `FAILED` status
3. A retry attempt is NOT counted when:
   - Task fails validation before agent starts (planning errors)
   - User manually resets retry counter (admin action)
4. When `retryCount >= maxRetries`:
   - If failure is `recoverable` but unresolved → task status `BLOCKED`, mission `BLOCKED`
   - If failure is `non-recoverable` → task status `FAILED`; mission `FAILED` if on critical path
5. `BLOCKED` missions MUST surface:
   - Task ID and title
   - Failure classification and message
   - Retry count and limit
   - Suggested human actions
6. Retry policy MUST support exponential backoff between attempts (default: 0s, 30s, 120s).
7. Token budget per task MAY be enforced (optional `maxTokensPerTask` constraint).
8. Retry state MUST persist across orchestrator restarts.
9. Admin API MUST allow: reset retries, increase limit, force-skip task (with audit log).
10. Metrics MUST track: retries per mission, retry success rate, average retries to heal.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Failure/healing outcome | Events |
| Input | `maxRetries` config | Mission/task constraints |
| Output | Retry state | `{ taskId, retryCount, maxRetries, lastAttemptAt }` |
| Output | Block/fail transitions | Workflow events |

## Acceptance Criteria

- [ ] Task with `maxRetries: 3` blocks after 3 failed healing iterations
- [ ] Mission `constraints.maxRetries` applies to all tasks without override
- [ ] Task-level override respected when set
- [ ] Backoff delays observed between retry attempts
- [ ] `BLOCKED` mission shows actionable context in UI
- [ ] Retry count survives orchestrator restart
- [ ] Admin reset retries allows workflow continuation
- [ ] Metrics dashboard shows retry success rate

## Dependencies

- FR-13 — Failure events
- FR-14 — Self-healing loop
- FR-01 — Mission constraints
- [framework/workflow-engine.md](../framework/workflow-engine.md)
- [framework/monitoring.md](../framework/monitoring.md)

## Non-Goals

- Retry across mission boundaries
- Automatic mission restart from scratch on failure
- Cost-based retry throttling (see future cost optimization)

## Open Questions

1. Different maxRetries per failure classification?
2. Auto-escalate to human via email/Slack on BLOCKED?
3. Partial mission success — deploy what works, block remaining tasks?

## Examples

**Mission constraint:**

```yaml
constraints:
  maxRetries: 3
  retryBackoffMs: [0, 30000, 120000]
```

**Retry state record:**

```json
{
  "taskId": "t-test-contacts",
  "retryCount": 2,
  "maxRetries": 3,
  "lastAttemptAt": "2026-06-22T14:35:00Z",
  "nextEligibleAt": "2026-06-22T14:37:00Z",
  "failures": ["fail-001", "fail-002"]
}
```

**Blocked mission UI payload:**

```json
{
  "missionId": "m-7f3a2b1c",
  "status": "BLOCKED",
  "blockedTask": {
    "id": "t-test-contacts",
    "title": "Test contacts feature",
    "retryCount": 3,
    "maxRetries": 3,
    "lastFailure": {
      "classification": "assertion_failure",
      "message": "Contact list empty after create"
    },
    "suggestedActions": [
      "Review healing log at artifacts/healing-log/t-test-contacts.json",
      "Reset retries and provide hint via mission amendment",
      "Skip task (requires admin)"
    ]
  }
}
```
