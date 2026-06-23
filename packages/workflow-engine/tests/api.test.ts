import { afterEach, describe, expect, test } from "bun:test";
import { StubAgentRuntime } from "../src/agents/stub.ts";
import { signInternalJwt } from "../src/server/auth.ts";
import { createWorkflowServer } from "../src/server/server.ts";
import type { WorkflowServer } from "../src/server/server.ts";

const TEST_SECRET = "test-internal-jwt-secret";

let activeServer: WorkflowServer | null = null;

afterEach(() => {
  activeServer?.stop();
  activeServer = null;
});

async function startTestServer() {
  const instance = createWorkflowServer({
    port: 0,
    jwtSecret: TEST_SECRET,
    dbPath: ":memory:",
  });
  activeServer = instance;
  const token = await signInternalJwt(TEST_SECRET, "agent-runtime");
  return { ...instance, token, baseUrl: `http://127.0.0.1:${instance.port}` };
}

function seedMission(engine: WorkflowServer["engine"], missionId = "m-api-test") {
  return engine.createMission({
    id: missionId,
    goal: "HTTP API test mission",
    seedNodes: [
      {
        id: "t-discover",
        kind: "task",
        type: "discover-requirements",
        assignedAgentType: "requirement-discovery",
        title: "Discover",
      },
      {
        id: "t-research",
        kind: "task",
        type: "research",
        assignedAgentType: "research",
        title: "Research",
      },
    ],
    seedEdges: [{ from: "t-discover", to: "t-research" }],
  });
}

describe("workflow HTTP API", () => {
  test("rejects internal routes without bearer token", async () => {
    const { baseUrl } = await startTestServer();
    const res = await fetch(`${baseUrl}/internal/v1/missions/m-1/start`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  test("rejects unsigned bearer token", async () => {
    const { baseUrl } = await startTestServer();
    const res = await fetch(`${baseUrl}/internal/v1/missions/m-1/start`, {
      method: "POST",
      headers: { authorization: "Bearer not-a-real-jwt" },
    });
    expect(res.status).toBe(401);
  });

  test("completeTask happy path via HTTP", async () => {
    const { baseUrl, token, engine } = await startTestServer();
    const mission = seedMission(engine);
    const missionId = mission.id;

    const startRes = await fetch(
      `${baseUrl}/internal/v1/missions/${missionId}/start`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    expect(startRes.status).toBe(200);
    const startBody = await startRes.json();
    expect(startBody.scheduled.length).toBeGreaterThan(0);

    const running = engine
      .getStore()
      .listExecutions(missionId)
      .find((e) => e.status === "RUNNING");
    expect(running).toBeDefined();

    const task = engine.getStore().getTask(missionId, running!.taskId)!;
    const result = new StubAgentRuntime().run(task, missionId);

    const completeRes = await fetch(
      `${baseUrl}/internal/v1/tasks/${running!.id}/complete`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: `http-complete:${running!.id}`,
          result,
        }),
      },
    );

    expect(completeRes.status).toBe(200);
    const completeBody = await completeRes.json();
    expect(completeBody.newStatus).toBe("SUCCESS");
    expect(completeBody.duplicate).toBe(false);
    expect(completeBody.continuation.missionStatus).toBe("RUNNING");
  });

  test("completeTask idempotency via HTTP", async () => {
    const { baseUrl, token, engine } = await startTestServer();
    const mission = seedMission(engine, "m-idem-http");
    await fetch(`${baseUrl}/internal/v1/missions/${mission.id}/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    const running = engine
      .getStore()
      .listExecutions(mission.id)
      .find((e) => e.status === "RUNNING")!;
    const task = engine.getStore().getTask(mission.id, running.taskId)!;
    const result = new StubAgentRuntime().run(task, mission.id);
    const body = JSON.stringify({
      idempotencyKey: "idem-http-key",
      result,
    });

    const first = await fetch(
      `${baseUrl}/internal/v1/tasks/${running.id}/complete`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body,
      },
    );
    const second = await fetch(
      `${baseUrl}/internal/v1/tasks/${running.id}/complete`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body,
      },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.duplicate).toBe(false);
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.newStatus).toBe(firstBody.newStatus);
  });

  test("schedule triggers eligible tasks", async () => {
    const { baseUrl, token, engine } = await startTestServer();
    const mission = seedMission(engine, "m-schedule-http");
    engine.getStore().updateMissionStatus(mission.id, "RUNNING");

    const scheduleRes = await fetch(`${baseUrl}/internal/v1/schedule`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        missionId: mission.id,
        triggerEventId: "evt-manual-schedule",
        idempotencyKey: "schedule-manual-1",
      }),
    });

    expect(scheduleRes.status).toBe(200);
    const scheduleBody = await scheduleRes.json();
    expect(
      scheduleBody.scheduled.some(
        (item: { taskId: string }) => item.taskId === "t-discover",
      ),
    ).toBe(true);
    expect(scheduleBody.missionStatus).toBe("RUNNING");
  });

  test("public mission projection and events", async () => {
    const { baseUrl, token, engine } = await startTestServer();
    const mission = seedMission(engine, "m-public");
    await fetch(`${baseUrl}/internal/v1/missions/${mission.id}/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    const missionRes = await fetch(`${baseUrl}/v1/missions/${mission.id}`);
    expect(missionRes.status).toBe(200);
    const missionBody = await missionRes.json();
    expect(missionBody.mission.status).toBe("RUNNING");
    expect(missionBody.tasks.length).toBe(2);

    const eventsRes = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/events?limit=5`,
    );
    expect(eventsRes.status).toBe(200);
    const eventsBody = await eventsRes.json();
    expect(eventsBody.events.length).toBeGreaterThan(0);
    expect(eventsBody.events.some((e: { type: string }) => e.type === "mission.started")).toBe(
      true,
    );
  });
});
