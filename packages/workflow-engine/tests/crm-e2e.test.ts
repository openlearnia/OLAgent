import { describe, expect, test } from "bun:test";
import { WorkflowEngine } from "../src/engine/engine.ts";
import { assertTransition } from "../src/engine/state-machine.ts";
import { runCrmMission } from "../src/simulations/crm-mission.ts";
import { StubAgentRuntime } from "../src/agents/stub.ts";
import {
  CRM_MISSION_ID,
} from "../src/fixtures/crm-seed.ts";
import { VerificationReportSchema } from "../src/schemas/validators.ts";

describe("CRM mission e2e", () => {
  test("runs seed DAG + merged plan to mission SUCCESS", () => {
    const result = runCrmMission();
    expect(result.finalStatus).toBe("SUCCESS");
    expect(result.mission.id).toBe(CRM_MISSION_ID);
    expect(result.eventTypes).toContain("mission.completed");
    expect(result.eventTypes).toContain("gate.completed");
  });

  test("verification artifact gate requires verified report", () => {
    const engine = new WorkflowEngine();
    const { finalStatus } = runCrmMission(
      { missionId: "m-verify-inspect" },
      engine,
    );
    expect(finalStatus).toBe("SUCCESS");

    const verifyExec = engine
      .getStore()
      .latestExecution("m-verify-inspect", "t-verify");
    expect(verifyExec?.status).toBe("SUCCESS");
    expect(verifyExec?.result?.summary).toStartWith("VERIFIED:");

    const report = JSON.parse(
      verifyExec!.result!.summary.slice("VERIFIED:".length),
    );
    const parsed = VerificationReportSchema.parse(report);
    expect(parsed.status).toBe("verified");
    expect(parsed.checks.every((c) => c.passed)).toBe(true);
  });

  test("completeTask idempotency deduplicates continuation", () => {
    const engine = new WorkflowEngine();
    const mission = engine.createMission({
      id: "m-idem",
      goal: "idempotency test",
      seedNodes: [
        {
          id: "t-discover",
          kind: "task",
          type: "discover-requirements",
          assignedAgentType: "requirement-discovery",
          title: "Discover",
        },
      ],
      seedEdges: [],
    });
    engine.startMission(mission.id);
    const store = engine.getStore();
    const running = store
      .listExecutions(mission.id)
      .find((e) => e.status === "RUNNING");
    expect(running).toBeDefined();

    const stub = new StubAgentRuntime();
    const task = store.getTask(mission.id, running!.taskId)!;
    const result = stub.run(task, mission.id);
    const key = `complete:${running!.id}:test-key`;

    const first = engine.completeTask(running!.id, {
      idempotencyKey: key,
      result,
    });
    const second = engine.completeTask(running!.id, {
      idempotencyKey: key,
      result,
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.newStatus).toBe(first.newStatus);
  });

  test("state machine rejects illegal transitions", () => {
    expect(() => assertTransition("SUCCESS", "schedule")).toThrow();
    expect(assertTransition("RUNNING", "complete_success")).toBe("SUCCESS");
    expect(assertTransition("FAILED", "healing_retest_pass")).toBe("SUCCESS");
  });
});

describe("CRM healing path", () => {
  test("browser failure heals to SUCCESS and completes mission", () => {
    const result = runCrmMission({ simulateBrowserFailure: true });
    expect(result.finalStatus).toBe("SUCCESS");
    expect(result.eventTypes).toContain("healing.iteration.started");
    expect(result.eventTypes).toContain("healing.iteration.completed");

    const engine = new WorkflowEngine();
    const { finalStatus } = runCrmMission(
      { missionId: "m-heal-inspect", simulateBrowserFailure: true },
      engine,
    );
    expect(finalStatus).toBe("SUCCESS");

    const browserFinal = engine
      .getStore()
      .latestExecution("m-heal-inspect", "t-browser");
    expect(browserFinal?.status).toBe("SUCCESS");
  });
});
