import type { AgentResult, Task } from "../types.ts";
import { validateAgentResult } from "../schemas/validators.ts";
import crmPlan from "../fixtures/crm-plan.json";

const VERIFICATION_REPORT = {
  missionId: "m-crm-ref",
  deployTaskId: "t-deploy",
  status: "verified" as const,
  checks: [
    { name: "reachability" as const, passed: true, duration_ms: 120 },
    { name: "api_health" as const, passed: true, duration_ms: 45 },
    { name: "api_smoke" as const, passed: true, duration_ms: 230 },
    { name: "ui_accessible" as const, passed: true, duration_ms: 890 },
    { name: "auth_working" as const, passed: true, duration_ms: 1100 },
  ],
  verifiedAt: "2026-06-22T18:00:00.000Z",
};

export interface StubAgentOptions {
  /** When true, t-browser fails once with needsHealing before succeeding */
  simulateBrowserFailure?: boolean;
}

export class StubAgentRuntime {
  private browserFailureConsumed = false;

  constructor(private options: StubAgentOptions = {}) {}

  run(task: Task, missionId: string): AgentResult {
    const result = this.buildResult(task, missionId);
    return validateAgentResult(result);
  }

  private buildResult(task: Task, missionId: string): AgentResult {
    switch (task.type) {
      case "discover-requirements":
        return {
          status: "COMPLETED",
          artifacts: ["requirements.md"],
          commits: ["disc0001"],
          summary: "Discovered CRM requirements: contacts, deals, auth",
        };
      case "research":
        return {
          status: "COMPLETED",
          artifacts: ["research-report.md"],
          commits: ["res00001"],
          summary: "Researched CRM patterns for small businesses",
        };
      case "architecture":
        return {
          status: "COMPLETED",
          artifacts: [
            "architecture.md",
            "database-schema.md",
            "openapi.yaml",
          ],
          commits: ["arch0001"],
          summary: "Designed Hono API + React UI on Cloudflare",
        };
      case "plan-tasks": {
        const plan = { ...crmPlan, missionId };
        return {
          status: "COMPLETED",
          artifacts: ["tasks/plan.json", "planning-report.md"],
          commits: ["plan0001"],
          summary: `PLAN:${JSON.stringify(plan)}`,
        };
      }
      case "setup-repo":
        return {
          status: "COMPLETED",
          artifacts: ["package.json", "packages/api/package.json"],
          commits: ["setup001"],
          summary: "Initialized Bun monorepo",
        };
      case "schema-migration":
        return {
          status: "COMPLETED",
          artifacts: ["packages/api/migrations/001_contacts.sql"],
          commits: ["schema01"],
          summary: "Created D1 contacts schema",
        };
      case "implement-backend":
        return {
          status: "COMPLETED",
          artifacts: ["packages/api/src/routes/contacts.ts"],
          commits: ["api00001"],
          summary: "Implemented /api/contacts CRUD",
        };
      case "implement-frontend":
        return {
          status: "COMPLETED",
          artifacts: ["packages/web/src/pages/Contacts.tsx"],
          commits: ["ui000001"],
          summary: "Implemented contacts UI",
        };
      case "write-tests":
        return {
          status: "COMPLETED",
          artifacts: ["packages/api/src/routes/contacts.test.ts"],
          commits: ["test0001"],
          summary: "Unit and integration tests pass",
        };
      case "browser-test":
        if (
          this.options.simulateBrowserFailure &&
          !this.browserFailureConsumed &&
          task.id === "t-browser"
        ) {
          this.browserFailureConsumed = true;
          return {
            status: "FAILED",
            artifacts: [],
            commits: [],
            summary: "E2E contact flow failed",
            needsHealing: true,
            error: {
              code: "TEST_FAILURE",
              message: "Expected 200, received 404",
              recoverable: true,
              classification: "assertion_failure",
            },
          };
        }
        return {
          status: "COMPLETED",
          artifacts: ["artifacts/browser/t-browser.json"],
          commits: ["browser1"],
          summary: "E2E contact flow passes",
        };
      case "deploy":
        return {
          status: "COMPLETED",
          artifacts: [`artifacts/deployment/${task.id}.json`],
          commits: ["deploy01"],
          summary: "Deployed to Cloudflare staging",
        };
      case "verify-deployment": {
        const report = { ...VERIFICATION_REPORT, missionId };
        return {
          status: "COMPLETED",
          artifacts: [`artifacts/verification/${missionId}.json`],
          commits: ["verify01"],
          summary: `VERIFIED:${JSON.stringify(report)}`,
        };
      }
      case "heal-analyze-fix":
        return {
          status: "COMPLETED",
          artifacts: [`artifacts/healing/${task.id}.patch`],
          commits: ["healfix1"],
          summary: "Applied fix for E2E failure",
        };
      case "heal-retest":
        return {
          status: "COMPLETED",
          artifacts: [],
          commits: [],
          summary: "Retest passed",
        };
      default:
        return {
          status: "COMPLETED",
          artifacts: [],
          commits: [],
          summary: `Stub completed ${task.type}`,
        };
    }
  }

  reset(): void {
    this.browserFailureConsumed = false;
  }
}
