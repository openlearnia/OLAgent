import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createWorkflowServer,
  wireAgentRuntimeCaller,
  type WorkflowServer,
} from "@olagent/workflow-engine";
import { runCli } from "../src/cli.ts";

const TEST_SECRET = "test-cli-jwt-secret";
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

async function startSubprocessCallerEngine() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "asf-caller-"));
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
    dryRun: true,
  });

  stashEnv("ASF_INTERNAL_JWT_SECRET", TEST_SECRET);
  stashEnv("ASF_ENGINE_URL", `http://127.0.0.1:${server.port}`);
  stashEnv("ASF_HOME", tempRoot);
  stashEnv("ASF_WORKSPACES_ROOT", workspacesRoot);
  stashEnv("ASF_USE_STUB_AGENTS", undefined);
  stashEnv("ASF_AGENT_RUN_DRY_RUN", "1");

  return { workspacesRoot };
}

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

describe("subprocess agent runtime caller", () => {
  test("mission create → start → watch reaches SUCCESS via dry-run subprocess", async () => {
    await startSubprocessCallerEngine();
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
  }, 180_000);

  test("asf agent run --dry-run validates bundle and writes result", async () => {
    stashEnv("ASF_INTERNAL_JWT_SECRET", TEST_SECRET);
    const bundleDir = await mkdtemp(path.join(tmpdir(), "asf-bundle-"));
    tempRoot = bundleDir;

    const bundlePath = path.join(bundleDir, "te-dryrun.json");
    const resultPath = path.join(bundleDir, "te-dryrun.result.json");
    const workspace = path.join(bundleDir, "workspace");

    const bundle = {
      version: "1.0",
      taskExecutionId: "te-dryrun",
      agentId: "a-dry",
      agentType: "requirement-discovery",
      contractVersion: "1.0.0",
      engineUrl: "http://127.0.0.1:3100",
      executionToken: "token",
      timeoutMs: 3_600_000,
      resultPath,
      context: {
        mission: {
          id: "m-dry",
          goal: "dry run",
          constraints: {},
        },
        task: {
          id: "t-discover",
          type: "discover-requirements",
          title: "Discover",
          acceptanceCriteria: [],
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

    const code = await runCli([
      "agent",
      "run",
      "--bundle",
      bundlePath,
      "--dry-run",
    ]);
    expect(code).toBe(0);

    const result = await Bun.file(resultPath).json();
    expect(result.status).toBe("COMPLETED");
    expect(result.summary).toContain("CRM");
  });
});
