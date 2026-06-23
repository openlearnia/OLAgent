# FR-12 — Autonomous Testing

## Summary

ASF must autonomously generate and execute tests across multiple layers — unit, integration, browser, and API — validating implementation against requirements and architecture contracts without human test execution.

## User Story

> As a user, I want ASF to prove the application works by running comprehensive automated tests so that I can trust the deployed output.

## System Story

> As the Testing Agent, I must generate test suites where missing, execute all test layers, collect structured results, and report pass/fail status to the workflow engine and failure detection system.

## Requirements

1. The Testing Agent MUST support four test layers:

| Layer | Framework | Scope |
|-------|-----------|-------|
| Unit | `bun test` | Functions, modules, isolated logic |
| Integration | `bun test` | DB, service interactions |
| API | HTTP client tests | OpenAPI contract validation |
| Browser | Browser MCP (FR-11) | UI workflows, E2E |

2. Test tasks MUST be scheduled after corresponding implementation tasks (via FR-06 dependencies).
3. The agent MUST:
   - Generate missing tests for implemented features (if not created by implementation agent)
   - Execute `bun test` for unit/integration
   - Execute API tests against running local or staging server
   - Execute browser flows for critical user journeys from `requirements.md`
4. Test results MUST be structured:

```json
{
  "layer": "unit",
  "passed": 42,
  "failed": 1,
  "skipped": 0,
  "duration_ms": 3200,
  "failures": [{ "test": "...", "error": "...", "file": "..." }]
}
```

5. Results MUST be persisted: `artifacts/test-results/{taskId}-{timestamp}.json`
6. Results MUST be indexed in long-term memory (FR-18).
7. Any test failure MUST trigger failure detection (FR-13) — task status MUST NOT be `SUCCESS`.
8. API tests MUST validate response schemas against `openapi.yaml`.
9. Browser tests MUST cover at minimum: login, primary CRUD flow, logout (when auth required).
10. Test execution MUST be repeatable; flaky test detection SHOULD flag tests failing intermittently (3-run heuristic).

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Source code + tests | Workspace |
| Input | `openapi.yaml` | Contract validation |
| Input | `requirements.md` | User journey definitions |
| Input | Deployment URL (for API/browser) | URL string |
| Output | Test result reports | JSON |
| Output | Generated test files | `*.test.ts`, browser flow YAML |
| Output | Coverage report | Optional lcov/json |

## Acceptance Criteria

- [ ] `bun test` executed and results captured for CRM mission
- [ ] API test validates `/api/contacts` response matches OpenAPI schema
- [ ] Browser test completes login → create contact → verify list flow
- [ ] Failed test prevents task `SUCCESS` and triggers FR-13
- [ ] Test results visible in Task View UI
- [ ] Generated tests committed via FR-10

## Dependencies

- FR-09 — Code under test
- FR-11 — Browser automation
- FR-13 — Failure routing
- FR-10 — Commit test files
- FR-18 — Result persistence

## Non-Goals

- Load/performance testing (future)
- Manual exploratory testing
- Test environment provisioning beyond local/staging (v1)

## Open Questions

1. Minimum coverage threshold for mission success?
2. Auto-start local dev server for API/browser tests?
3. Snapshot testing for UI components?

## Examples

**Test task definition:**

```yaml
task:
  id: t-test-contacts
  type: write-tests
  title: "Test contacts feature across all layers"
  dependencies: [t-contacts-api, t-contacts-ui]
  acceptance_criteria:
    - All unit tests pass
    - API contract tests pass
    - Browser E2E contact flow passes
```

**API contract test pattern:**

```typescript
// packages/api/src/routes/contacts.contract.test.ts
import { describe, test, expect } from "bun:test";
import { validateAgainstOpenAPI } from "../test-utils/openapi";

describe("GET /api/contacts", () => {
  test("response matches openapi schema", async () => {
    const res = await fetch(`${BASE_URL}/api/contacts`);
    expect(res.status).toBe(200);
    await validateAgainstOpenAPI(res, "GET", "/api/contacts");
  });
});
```

**Browser E2E flow reference:**

```yaml
# artifacts/browser-flows/contact-crud.yaml
name: Contact CRUD E2E
steps:
  - navigate: /contacts
  - click: "Add Contact"
  - fill: { selector: "#name", value: "Jane Doe" }
  - fill: { selector: "#email", value: "jane@example.com" }
  - click: "Save"
  - assert_text: { selector: ".contact-list", contains: "Jane Doe" }
```
