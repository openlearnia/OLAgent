import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMcpProxyServer } from "@olagent/mcp-proxy";
import {
  createWorkflowServer,
  wireAgentRuntimeCaller,
  spawnCursorAcpSession,
  mapAcpSessionToAgentResult,
  type WorkflowServer,
} from "@olagent/workflow-engine";

const TEST_SECRET = "test-acp-caller-jwt";
const MOCK_AGENT = path.join(
  import.meta.dir,
  "../../acp-client/tests/fixtures/mock-agent.ts",
);

let server: WorkflowServer | null = null;
let mcpServer: ReturnType<typeof createMcpProxyServer> | null = null;
let tempRoot: string | null = null;
let prevEnv: Record<string, string | undefined> = {};

afterEach(async () => {
  server?.stop();
  server = null;
  mcpServer?.stop();
  mcpServer = null;
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

async function startAcpCallerEngine() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "asf-acp-caller-"));
  const workspacesRoot = path.join(tempRoot, "workspaces");
  const dbPath = path.join(tempRoot, "workflow.db");

  mcpServer = createMcpProxyServer({ port: 0 });
  const mcpEndpoint = mcpServer.url;

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
    mcpEndpoint,
    dryRun: false,
    acpAgentBin: "bun",
    acpAgentArgs: ["run", MOCK_AGENT],
    acpOptions: { skipAuthenticate: true },
  });

  stashEnv("ASF_INTERNAL_JWT_SECRET", TEST_SECRET);
  stashEnv("ASF_ENGINE_URL", `http://127.0.0.1:${server.port}`);
  stashEnv("ASF_HOME", tempRoot);
  stashEnv("ASF_WORKSPACES_ROOT", workspacesRoot);
  stashEnv("ASF_MCP_ENDPOINT", mcpEndpoint);
  stashEnv("ASF_AGENT_BACKEND", "cursor-acp");
  stashEnv("ASF_CURSOR_AGENT_TYPES", "backend-engineer");
  stashEnv("ASF_AGENT_RUN_DRY_RUN", "0");
  stashEnv("ASF_USE_STUB_AGENTS", undefined);

  return { workspacesRoot };
}

describe("ACP agent runtime caller", () => {
  test("spawnCursorAcpSession maps mock agent to COMPLETED", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "acp-spawn-"));
    const server = createMcpProxyServer({ port: 0 });
    try {
      const bundle = {
        version: "1.0" as const,
        taskExecutionId: "te-spawn-1",
        sessionId: "te-spawn-1",
        agentId: "agent-1",
        agentType: "backend-engineer",
        contractVersion: "1.0.0",
        engineUrl: "http://127.0.0.1:3000",
        mcpEndpoint: server.url,
        executionToken: "test-token",
        timeoutMs: 300_000,
        resultPath: path.join(workspace, ".asf/bundles/te-spawn-1.result.json"),
        context: {
          mission: { id: "m1", goal: "Build CRM", constraints: {} },
          task: {
            id: "t-contacts-api",
            type: "implement-backend",
            title: "Contacts API",
            acceptanceCriteria: ["routes exist"],
            dependencies: [],
            attempt: 1,
          },
          artifacts: [],
          memory: [],
          priorFailures: [],
          workspace,
        },
      };

      const session = await spawnCursorAcpSession(bundle, {
        engineUrl: "http://127.0.0.1:3000",
        executionToken: "test-token",
        agentBin: "bun",
        agentArgs: ["run", MOCK_AGENT],
        acpOptions: { skipAuthenticate: true },
      });

      const result = mapAcpSessionToAgentResult(session);
      expect(result.status).toBe("COMPLETED");
      expect(result.summary).toContain("ACP session completed");
    } finally {
      server.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("backend-engineer task completes via mock agent acp session", async () => {
    await startAcpCallerEngine();

    const mission = server!.engine.createMission({
      id: "m-acp-single",
      goal: "ACP caller test",
      workspacePath: path.join(tempRoot!, "workspaces/m-acp-single"),
      seedNodes: [
        {
          id: "t-contacts-api",
          kind: "task",
          type: "implement-backend",
          title: "Contacts API",
          assignedAgentType: "backend-engineer",
          acceptanceCriteria: ["routes exist"],
        },
      ],
      seedEdges: [],
    });

    server!.engine.startMission(mission.id);

    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const execution = server!.engine
      .getStore()
      .listExecutions(mission.id)
      .find((e) => e.taskId === "t-contacts-api");

    expect(execution?.status).toBe("SUCCESS");
    expect(execution?.result?.status).toBe("COMPLETED");
    expect(execution?.result?.summary).toContain("ACP session completed");
  }, 60_000);
});

describe.skipIf(!process.env.CURSOR_API_KEY)("live Cursor ACP caller", () => {
  test("optional live backend-engineer via agent acp", async () => {
    await startAcpCallerEngine();
    stashEnv("ASF_CURSOR_AGENT_BIN", undefined);

    const mission = server!.engine.createMission({
      id: "m-acp-live",
      goal: "Live ACP smoke",
      workspacePath: path.join(tempRoot!, "workspaces/m-acp-live"),
      seedNodes: [
        {
          id: "t-live",
          kind: "task",
          type: "implement-backend",
          title: "Hello",
          assignedAgentType: "backend-engineer",
          acceptanceCriteria: [],
        },
      ],
      seedEdges: [],
    });

    server!.engine.startMission(mission.id);

    await new Promise((resolve) => setTimeout(resolve, 120_000));

    const execution = server!.engine
      .getStore()
      .listExecutions(mission.id)[0];

    expect(execution?.status).toBe("SUCCESS");
  }, 180_000);
});
