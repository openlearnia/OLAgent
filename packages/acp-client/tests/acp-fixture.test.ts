import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMcpProxyServer } from "@olagent/mcp-proxy";
import {
  evaluatePermission,
  runCursorAcpSession,
} from "../src/index.ts";
import type { ContextBundle } from "@olagent/workflow-engine";

const MOCK_AGENT = path.join(import.meta.dir, "fixtures/mock-agent.ts");

function sampleBundle(workspace: string, mcpEndpoint: string): ContextBundle {
  return {
    version: "1.0",
    taskExecutionId: "te-fixture-1",
    sessionId: "te-fixture-1",
    agentId: "agent-1",
    agentType: "backend-engineer",
    contractVersion: "1.0.0",
    engineUrl: "http://127.0.0.1:3000",
    mcpEndpoint,
    executionToken: "test-token",
    timeoutMs: 300_000,
    resultPath: path.join(workspace, ".asf/bundles/te-fixture-1.result.json"),
    context: {
      mission: { id: "m1", goal: "Build CRM", constraints: {} },
      task: {
        id: "t-contacts-api",
        type: "implement-backend",
        title: "Contacts API",
        description: "Implement CRUD routes",
        acceptanceCriteria: ["bun test packages/api passes"],
        dependencies: [],
        attempt: 1,
      },
      artifacts: [{ path: "artifacts/openapi.yaml" }],
      memory: [],
      priorFailures: [],
      workspace,
    },
  };
}

describe("permission policy", () => {
  test("auto-approves workspace-relative write", () => {
    const decision = evaluatePermission(
      { kind: "filesystem.write", path: "src/index.ts" },
      "/tmp/ws",
      "auto",
    );
    expect(decision.approved).toBe(true);
  });

  test("auto-denies path traversal", () => {
    const decision = evaluatePermission(
      { kind: "filesystem.write", path: "../../../etc/passwd" },
      "/tmp/ws",
      "auto",
    );
    expect(decision.approved).toBe(false);
  });

  test("strict mode denies all", () => {
    const decision = evaluatePermission(
      { kind: "filesystem.write", path: "src/index.ts" },
      "/tmp/ws",
      "strict",
    );
    expect(decision.approved).toBe(false);
  });
});

describe("ACP fixture integration", () => {
  test("mock agent lifecycle initialize → session/new → session/prompt", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "acp-fixture-"));
    const server = createMcpProxyServer({ port: 0 });

    try {
      const bundle = sampleBundle(workspace, server.url);
      const result = await runCursorAcpSession(bundle, {
        agentBin: "bun",
        agentArgs: ["run", MOCK_AGENT],
        skipAuthenticate: true,
      });

      expect(result.acpSessionId).toBe("mock-acp-session-1");
      expect(result.stopReason).toBe("end_turn");
      expect(result.updates.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    } finally {
      server.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!process.env.CURSOR_API_KEY)("live Cursor smoke", () => {
  test("optional live agent acp session", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "acp-live-"));
    const server = createMcpProxyServer({ port: 0 });

    try {
      const bundle = sampleBundle(workspace, server.url);
      const result = await runCursorAcpSession(bundle, { skipAuthenticate: false });
      expect(result.error).toBeUndefined();
    } finally {
      server.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
