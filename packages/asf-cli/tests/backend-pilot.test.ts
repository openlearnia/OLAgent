import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createWorkflowServer,
  mintExecutionToken,
  wireAgentRuntimeCaller,
  type WorkflowServer,
} from "@olagent/workflow-engine";
import { runCli } from "../src/cli.ts";

const TEST_SECRET = "test-pilot-jwt-secret";
let server: WorkflowServer | null = null;
let tempRoot: string | null = null;
let prevEnv: Record<string, string | undefined> = {};

afterEach(async () => {
  server?.stop();
  server = null;
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
  for (const [key, value] of Object.entries(prevEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  prevEnv = {};
});

function stashEnv(key: string, value: string | undefined): void {
  if (!(key in prevEnv)) prevEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function startMockPilotEngine() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "asf-pilot-"));
  const workspacesRoot = path.join(tempRoot, "workspaces");
  const dbPath = path.join(tempRoot, "workflow.db");

  server = createWorkflowServer({
    port: 0,
    jwtSecret: TEST_SECRET,
    dbPath,
    workspacesRoot,
    disableLeaseSweeper: true,
  });

  wireAgentRuntimeCaller(server.engine, {
    jwtSecret: TEST_SECRET,
    engineUrl: `http://127.0.0.1:${server.port}`,
    dryRun: false,
  });

  stashEnv("ASF_INTERNAL_JWT_SECRET", TEST_SECRET);
  stashEnv("ASF_ENGINE_URL", `http://127.0.0.1:${server.port}`);
  stashEnv("ASF_HOME", tempRoot);
  stashEnv("ASF_WORKSPACES_ROOT", workspacesRoot);
  stashEnv("ASF_USE_STUB_AGENTS", undefined);
  stashEnv("ASF_AGENT_RUN_DRY_RUN", "0");
  stashEnv("ASF_LLM_MOCK", "1");
  stashEnv("ASF_LLM_AGENT_TYPES", "backend-engineer");

  return { workspacesRoot };
}

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

describe("backend-engineer LLM pilot (ASF_LLM_MOCK=1)", () => {
  test("mission reaches SUCCESS with mock LLM backend tasks", async () => {
    await startMockPilotEngine();
    const fixture = path.join(
      REPO_ROOT,
      "requirements/fixtures/local-operator-mission.yaml",
    );

    const createCode = await runCli([
      "mission",
      "create",
      "--file",
      fixture,
      "--json",
    ]);
    expect(createCode).toBe(0);

    const startCode = await runCli(["mission", "start", "m-crm-local"]);
    expect(startCode).toBe(0);

    const watchCode = await runCli([
      "mission",
      "watch",
      "m-crm-local",
      "--interval",
      "1",
      "--json",
    ]);
    expect(watchCode).toBe(0);

    const mission = server!.engine.getStore().getMission("m-crm-local");
    expect(mission?.status).toBe("SUCCESS");

    const workspace = mission!.workspacePath;
    const contactsRoute = path.join(
      workspace,
      "packages/api/src/routes/contacts.ts",
    );
    expect(await Bun.file(contactsRoute).exists()).toBe(true);
  }, 300_000);

  test("asf agent run live mock writes artifact and completes via HTTP", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "asf-agent-live-"));
    const workspace = path.join(tempRoot, "workspace");
    await Bun.write(path.join(workspace, ".keep"), "");

    server = createWorkflowServer({
      port: 0,
      jwtSecret: TEST_SECRET,
      dbPath: ":memory:",
      disableLeaseSweeper: true,
    });

    stashEnv("ASF_INTERNAL_JWT_SECRET", TEST_SECRET);
    stashEnv("ASF_ENGINE_URL", `http://127.0.0.1:${server.port}`);
    stashEnv("ASF_LLM_MOCK", "1");
    stashEnv("ASF_AGENT_RUN_DRY_RUN", "0");
    stashEnv("ASF_WORKSPACES_ROOT", tempRoot);

    const mission = server.engine.createMission({
      id: "m-pilot",
      goal: "pilot",
      workspacePath: workspace,
      seedNodes: [
        {
          id: "t-contacts-api",
          kind: "task",
          type: "implement-backend",
          assignedAgentType: "backend-engineer",
          title: "Implement contacts API",
        },
      ],
      seedEdges: [],
    });

    server.engine.startMission(mission.id);
    const running = server.engine
      .getStore()
      .listExecutions(mission.id)
      .find((e) => e.status === "RUNNING");
    expect(running).toBeDefined();

    const executionToken = await mintExecutionToken(
      TEST_SECRET,
      { taskExecutionId: running!.id, agentId: running!.agentId ?? "a-pilot" },
      3_600_000,
    );

    const bundleDir = path.join(workspace, ".asf", "bundles");
    const resultPath = path.join(bundleDir, `${running!.id}.result.json`);
    const bundlePath = path.join(bundleDir, `${running!.id}.json`);
    const bundle = {
      version: "1.0",
      taskExecutionId: running!.id,
      agentId: running!.agentId,
      agentType: "backend-engineer",
      contractVersion: "1.0.0",
      engineUrl: `http://127.0.0.1:${server.port}`,
      executionToken,
      timeoutMs: 3_600_000,
      resultPath,
      context: {
        mission: { id: mission.id, goal: "pilot", constraints: {} },
        task: {
          id: "t-contacts-api",
          type: "implement-backend",
          title: "Implement contacts API",
          acceptanceCriteria: ["OpenAPI satisfied"],
          dependencies: [],
          attempt: 1,
        },
        artifacts: [],
        memory: [],
        priorFailures: [],
        workspace,
      },
    };
    await Bun.write(bundlePath, JSON.stringify(bundle));

    const code = await runCli(["agent", "run", "--bundle", bundlePath]);
    expect(code).toBe(0);

    const artifact = path.join(workspace, "packages/api/src/routes/contacts.ts");
    expect(await Bun.file(artifact).exists()).toBe(true);

    const execution = server.engine.getStore().getExecution(running!.id);
    expect(execution?.status).toBe("SUCCESS");
  }, 60_000);
});
