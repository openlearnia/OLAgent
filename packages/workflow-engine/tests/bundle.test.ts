import { describe, expect, test } from "bun:test";
import {
  buildContextBundle,
  ContextBundleSchema,
} from "../src/agents/bundle.ts";
import { getAgentContract } from "../src/agents/contracts.ts";
import type { Mission, Task, TaskExecution } from "../src/types.ts";

const mission: Mission = {
  id: "m-test",
  goal: "Test mission",
  constraints: { deployment: "cloudflare" },
  status: "RUNNING",
  workspacePath: "/tmp/workspaces/m-test",
  createdAt: "2026-06-24T00:00:00.000Z",
};

const task: Task = {
  id: "t-discover",
  missionId: "m-test",
  kind: "task",
  type: "discover-requirements",
  title: "Discover requirements",
  assignedAgentType: "requirement-discovery",
  dependencies: [],
  acceptanceCriteria: ["Requirements documented"],
  parallelSafe: false,
  maxRetries: 3,
};

const execution: TaskExecution = {
  id: "te-abc123",
  taskId: "t-discover",
  missionId: "m-test",
  attempt: 1,
  status: "RUNNING",
  agentId: "a-agent1",
  idempotencyKey: "pending:te-abc123",
  startedAt: "2026-06-24T00:00:00.000Z",
};

describe("context bundle builder", () => {
  test("buildContextBundle produces valid schema shape", () => {
    const bundle = buildContextBundle({
      mission,
      task,
      execution,
      engineUrl: "http://127.0.0.1:3100",
      executionToken: "test-token",
      contractVersion: "1.0.0",
    });

    expect(ContextBundleSchema.safeParse(bundle).success).toBe(true);
    expect(bundle.version).toBe("1.0");
    expect(bundle.taskExecutionId).toBe("te-abc123");
    expect(bundle.agentType).toBe("requirement-discovery");
    expect(bundle.contractVersion).toBe("1.0.0");
    expect(bundle.context.mission.id).toBe("m-test");
    expect(bundle.context.task.id).toBe("t-discover");
    expect(bundle.context.workspace).toBe(mission.workspacePath);
    expect(bundle.resultPath).toContain("te-abc123.result.json");
    expect(bundle.timeoutMs).toBe(
      getAgentContract("requirement-discovery").timeoutMs,
    );
  });

  test("bundle omits platform JWT secret from context", () => {
    const bundle = buildContextBundle({
      mission,
      task,
      execution,
      engineUrl: "http://127.0.0.1:3100",
      executionToken: "scoped-execution-token",
    });

    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("ASF_INTERNAL_JWT_SECRET");
    expect(bundle.executionToken).toBe("scoped-execution-token");
  });
});
