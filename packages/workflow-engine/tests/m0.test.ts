import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkflowEngine } from "../src/engine/engine.ts";
import { startLeaseSweeper } from "../src/engine/sweeper.ts";
import { createWorkflowServer } from "../src/server/server.ts";
import type { WorkflowServer } from "../src/server/server.ts";
import {
  CRM_SEED_EDGES,
  CRM_SEED_NODES,
} from "../src/fixtures/crm-seed.ts";

let activeServer: WorkflowServer | null = null;
let tempWorkspaceRoot: string | null = null;

afterEach(async () => {
  activeServer?.stop();
  activeServer = null;
  if (tempWorkspaceRoot) {
    await rm(tempWorkspaceRoot, { recursive: true, force: true });
    tempWorkspaceRoot = null;
  }
});

async function tempWorkspacesRoot() {
  tempWorkspaceRoot = await mkdtemp(path.join(tmpdir(), "asf-ws-"));
  return tempWorkspaceRoot;
}

describe("M0 engine hardening", () => {
  test("event bus receives task.scheduled on mission start", () => {
    const engine = new WorkflowEngine({ dbPath: ":memory:" });
    const seen: string[] = [];
    engine.getEventBus().subscribe((event) => {
      seen.push(event.type);
    });

    const m = engine.createMission({
      id: "m-bus-test",
      goal: "bus test",
      seedNodes: [CRM_SEED_NODES[0]!],
      seedEdges: [],
    });
    engine.startMission(m.id);

    expect(seen).toContain("mission.created");
    expect(seen).toContain("task.scheduled");
  });

  test("lease sweeper fails expired RUNNING executions", () => {
    let now = 1_700_000_000_000;
    const engine = new WorkflowEngine({
      dbPath: ":memory:",
      now: () => now,
    });

    const mission = engine.createMission({
      id: "m-lease",
      goal: "lease test",
      seedNodes: [CRM_SEED_NODES[0]!],
      seedEdges: [],
    });
    engine.startMission(mission.id);

    const running = engine
      .getStore()
      .listExecutions(mission.id)
      .find((e) => e.status === "RUNNING");
    expect(running).toBeDefined();

    engine.getStore().updateExecution(running!.id, {
      leaseExpiresAt: new Date(now - 1_000).toISOString(),
    });

    now += 60_000;
    const sweeper = startLeaseSweeper(engine, {
      intervalMs: 60_000,
      onStartup: false,
    });
    expect(sweeper.sweepOnce()).toBe(1);

    const updated = engine.getStore().getExecution(running!.id);
    expect(updated?.status).toBe("FAILED");
    sweeper.stop();
  });

  test("POST /v1/missions provisions workspace and CRM seed DAG", async () => {
    const workspacesRoot = await tempWorkspacesRoot();
    const instance = createWorkflowServer({
      port: 0,
      jwtSecret: "test-internal-jwt-secret",
      dbPath: ":memory:",
      workspacesRoot,
      leaseSweeperIntervalMs: 60_000,
    });
    activeServer = instance;
    const baseUrl = `http://127.0.0.1:${instance.port}`;

    const res = await fetch(`${baseUrl}/v1/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "m-crm-local",
        goal: "Build a CRM for small businesses",
        constraints: { environment: "staging" },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.mission.status).toBe("PENDING");
    expect(body.mission.workspacePath).toContain("m-crm-local");
    const taskIds = body.tasks.map((t: { id: string }) => t.id);
    for (const node of CRM_SEED_NODES) {
      expect(taskIds).toContain(node.id);
    }
    expect(taskIds).toContain("healing-t-browser");

    const missionYaml = await Bun.file(
      path.join(body.mission.workspacePath, "mission.yaml"),
    ).text();
    expect(missionYaml).toContain("Build a CRM for small businesses");

    const events = instance.engine
      .getStore()
      .listEvents("m-crm-local")
      .map((e) => e.type);
    expect(events).toContain("mission.created");
  });

  test("POST /v1/missions idempotency returns same mission", async () => {
    const workspacesRoot = await tempWorkspacesRoot();
    const instance = createWorkflowServer({
      port: 0,
      jwtSecret: "test-internal-jwt-secret",
      dbPath: ":memory:",
      workspacesRoot,
      disableLeaseSweeper: true,
    });
    activeServer = instance;
    const baseUrl = `http://127.0.0.1:${instance.port}`;

    const payload = {
      goal: "Idempotent mission",
      idempotencyKey: "create-mission-key-1",
    };

    const first = await fetch(`${baseUrl}/v1/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const second = await fetch(`${baseUrl}/v1/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const a = await first.json();
    const b = await second.json();
    expect(a.mission.id).toBe(b.mission.id);
  });
});
