# Reference Mission — CRM for Small Businesses

Minimal acceptance oracle for end-to-end ASF validation. All FR acceptance criteria referencing "CRM mission" SHOULD be testable against this fixture.

## Mission Input

```yaml
# mission.yaml — reference fixture
goal: "Build a CRM for small businesses"
constraints:
  stack: ["typescript", "bun", "react"]
  deployment: cloudflare
  database: d1
  auth: better-auth
  environment: staging
  verification:
    requireAuth: true
    primaryResource: contacts
    healthPath: /api/health
```

## Expected Artifacts

| Phase | Artifact | Minimum Content |
|-------|----------|-----------------|
| Discovery | `requirements.md` | Contact CRUD, deal pipeline, auth |
| Architecture | `architecture.md`, `database-schema.md`, `openapi.yaml` | `/api/contacts` CRUD, D1 schema |
| Planning | `tasks/plan.json` | ≥ 10 tasks; includes `verify-deployment` |
| Implementation | `packages/api/`, `packages/web/` | Hono API + React UI |
| Testing | `*.test.ts`, browser test results | Unit + integration pass |
| Deployment | `artifacts/deployment/{taskId}.json` | Staging URLs (web + api) |
| Verification | `artifacts/verification/{missionId}.json` | All checks `passed: true` |

## Verification Oracle (FR-17)

All checks MUST pass for mission `SUCCESS`:

| Check | Pass Condition |
|-------|----------------|
| `reachability` | `GET {webUrl}` → 200, < 10s |
| `api_health` | `GET {apiUrl}/api/health` → 200, body contains healthy indicator |
| `api_smoke` | `POST /api/contacts` then `GET /api/contacts` includes created record |
| `ui_accessible` | Browser loads web URL; no console errors |
| `auth_working` | Login with vault test credentials; `/contacts` accessible |

**Smoke data cleanup:** Records created during `api_smoke` (e.g., `Verify` contact) MUST be deleted before verification task completes.

## Task Graph Minimum

```
setup-repo → schema-migration → [implement-backend ∥ implement-frontend] → gate-merge-* → write-tests → browser-test → deploy → verify-deployment
```

Shared-surface tasks (`package.json`, root app entry, `openapi.yaml`) MUST be sequential per FR-05.

## Sample `tasks/plan.json` (excerpt)

Validates against [`schemas/tasks-plan.v1.json`](../schemas/tasks-plan.v1.json).

```json
{
  "missionId": "m-crm-ref",
  "version": "1.0",
  "epics": [
    { "id": "epic-contacts", "title": "Contact Management" }
  ],
  "tasks": [
    {
      "id": "t-setup",
      "type": "setup-repo",
      "title": "Initialize Bun monorepo",
      "assignedAgentType": "infra-engineer",
      "dependencies": [],
      "acceptanceCriteria": ["bun install succeeds"]
    },
    {
      "id": "t-schema",
      "type": "schema-migration",
      "title": "Create D1 schema",
      "assignedAgentType": "backend-engineer",
      "dependencies": ["t-setup"],
      "acceptanceCriteria": ["Migration applies cleanly"]
    },
    {
      "id": "t-contacts-api",
      "type": "implement-backend",
      "title": "Implement /api/contacts CRUD",
      "assignedAgentType": "backend-engineer",
      "dependencies": ["t-schema"],
      "parallelSafe": false,
      "acceptanceCriteria": ["OpenAPI contract satisfied"]
    },
    {
      "id": "t-contacts-ui",
      "type": "implement-frontend",
      "title": "Implement contacts UI",
      "assignedAgentType": "frontend-engineer",
      "dependencies": ["t-schema"],
      "acceptanceCriteria": ["Contacts list and form render"]
    },
    {
      "id": "t-tests",
      "type": "write-tests",
      "title": "Unit and integration tests",
      "assignedAgentType": "testing",
      "dependencies": ["t-contacts-api", "t-contacts-ui"],
      "acceptanceCriteria": ["bun test passes"]
    },
    {
      "id": "t-browser",
      "type": "browser-test",
      "title": "Browser E2E tests",
      "assignedAgentType": "testing",
      "dependencies": ["t-tests"],
      "acceptanceCriteria": ["E2E contact flow passes"]
    },
    {
      "id": "t-deploy",
      "type": "deploy",
      "title": "Deploy to Cloudflare staging",
      "assignedAgentType": "deployment",
      "dependencies": ["t-browser"],
      "acceptanceCriteria": ["Staging URLs in deployment report"]
    },
    {
      "id": "t-verify",
      "type": "verify-deployment",
      "title": "Verify staging deployment (FR-17)",
      "assignedAgentType": "verification",
      "dependencies": ["t-deploy"],
      "acceptanceCriteria": ["All FR-17 checks passed", "Smoke data cleaned up"]
    }
  ]
}
```

> Engine auto-materializes `gate-merge-{taskId}` nodes after planner merge (see [workflow-dsl.md §4.1](../../docs/workflow-dsl.md#41-planner-merge-semantics)).

## Non-Goals for This Fixture

- Custom domain DNS
- Production deployment (staging only unless operator approves)
- Multi-tenant org management
- Email notifications

## Related Documents

- [FR-01-mission-creation.md](../functional/FR-01-mission-creation.md)
- [FR-17-deployment-verification.md](../functional/FR-17-deployment-verification.md)
- [cross-review-synthesis.md](../reviews/cross-review-synthesis.md)
