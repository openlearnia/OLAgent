#!/usr/bin/env bun
/**
 * Manual smoke test — requires CURSOR_API_KEY and `agent` on PATH.
 *
 *   CURSOR_API_KEY=... bun run packages/acp-client/scripts/acp-smoke.ts
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMcpProxyServer } from "@olagent/mcp-proxy";
import { runCursorAcpSession } from "../src/index.ts";
import type { ContextBundle } from "@olagent/workflow-engine";

const workspace = await mkdtemp(path.join(tmpdir(), "acp-smoke-"));
const server = createMcpProxyServer({ port: 0 });

const bundle: ContextBundle = {
  version: "1.0",
  taskExecutionId: "te-smoke",
  sessionId: "te-smoke",
  agentId: "agent-smoke",
  agentType: "backend-engineer",
  contractVersion: "1.0.0",
  engineUrl: "http://127.0.0.1:3000",
  mcpEndpoint: server.url,
  executionToken: "smoke",
  timeoutMs: 120_000,
  resultPath: path.join(workspace, ".asf/bundles/te-smoke.result.json"),
  context: {
    mission: { id: "m-smoke", goal: "Smoke test", constraints: {} },
    task: {
      id: "t-smoke",
      type: "implement-backend",
      title: "Say hello",
      acceptanceCriteria: ["Responds with one sentence"],
      dependencies: [],
      attempt: 1,
    },
    artifacts: [],
    memory: [],
    priorFailures: [],
    workspace,
  },
};

console.log(`Workspace: ${workspace}`);
console.log(`MCP: ${server.url}`);

const result = await runCursorAcpSession(bundle);
console.log(JSON.stringify(result, null, 2));

server.stop();
