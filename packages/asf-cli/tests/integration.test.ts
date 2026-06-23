import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createWorkflowServer,
  wireStubAgentRuntime,
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

function stashEnv(key: string, value: string): void {
  if (!(key in prevEnv)) prevEnv[key] = process.env[key];
  process.env[key] = value;
}

async function startTestEngine() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "asf-cli-"));
  const workspacesRoot = path.join(tempRoot, "workspaces");
  const dbPath = path.join(tempRoot, "workflow.db");

  server = createWorkflowServer({
    port: 0,
    jwtSecret: TEST_SECRET,
    dbPath,
    workspacesRoot,
    disableLeaseSweeper: true,
  });
  wireStubAgentRuntime(server.engine);

  stashEnv("ASF_INTERNAL_JWT_SECRET", TEST_SECRET);
  stashEnv("ASF_ENGINE_URL", `http://127.0.0.1:${server.port}`);
  stashEnv("ASF_HOME", tempRoot);
  stashEnv("ASF_WORKSPACES_ROOT", workspacesRoot);

  return { baseUrl: `http://127.0.0.1:${server.port}`, workspacesRoot };
}

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

describe("asf CLI integration", () => {
  test("dev token prints JWT", async () => {
    stashEnv("ASF_INTERNAL_JWT_SECRET", TEST_SECRET);
    const code = await runCli(["dev", "token"]);
    expect(code).toBe(0);
  });

  test("mission create → start → watch reaches SUCCESS", async () => {
    await startTestEngine();
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
  }, 120_000);

  test("mission status returns projection", async () => {
    await startTestEngine();
    const fixture = path.join(
      REPO_ROOT,
      "requirements/fixtures/local-operator-mission.yaml",
    );

    await runCli(["mission", "create", "--file", fixture]);
    const statusCode = await runCli([
      "mission",
      "status",
      "m-crm-local",
      "--json",
    ]);
    expect(statusCode).toBe(2);
  });
});
