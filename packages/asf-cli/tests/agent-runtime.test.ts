import { describe, expect, test, mock } from "bun:test";
import {
  buildCompleteIdempotencyKey,
  postCompleteTask,
} from "../src/agent-runtime/complete.ts";
import {
  startHeartbeatLoop,
  HEARTBEAT_EXTEND_SECONDS,
} from "../src/agent-runtime/heartbeat.ts";
import {
  assembleBackendEngineerResult,
  targetArtifactForTask,
} from "../src/agent-runtime/result.ts";
import type { AgentContext } from "@olagent/workflow-engine";

const sampleContext: AgentContext = {
  mission: { id: "m-test", goal: "test", constraints: {} },
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
  workspace: "/tmp/ws",
};

describe("agent-runtime result assembly", () => {
  test("targetArtifactForTask maps implement-backend to contacts route", () => {
    expect(targetArtifactForTask("implement-backend", "t-contacts-api")).toBe(
      "packages/api/src/routes/contacts.ts",
    );
  });

  test("assembleBackendEngineerResult validates AgentResult shape", () => {
    const result = assembleBackendEngineerResult(
      sampleContext,
      ["packages/api/src/routes/contacts.ts"],
      Date.now() - 100,
      { input: 10, output: 20 },
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.artifacts).toContain("packages/api/src/routes/contacts.ts");
    expect(result.metrics?.tokenUsage.input).toBe(10);
    expect(result.metrics?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("buildCompleteIdempotencyKey is stable for same result", () => {
    const result = assembleBackendEngineerResult(
      sampleContext,
      ["a.ts"],
      Date.now(),
      { input: 0, output: 0 },
    );
    const a = buildCompleteIdempotencyKey("te-1", result);
    const b = buildCompleteIdempotencyKey("te-1", result);
    expect(a).toBe(b);
    expect(a.startsWith("complete:te-1:")).toBe(true);
  });
});

describe("heartbeat client", () => {
  test("posts heartbeat with execution token", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = mock(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ taskExecutionId: "te-hb" }), {
        status: 200,
      });
    });

    const handle = startHeartbeatLoop({
      engineUrl: "http://127.0.0.1:3999",
      taskExecutionId: "te-hb",
      executionToken: "exec-token",
      fetchFn: fetchFn as unknown as typeof fetch,
      intervalMs: 50,
    });

    await new Promise((r) => setTimeout(r, 120));
    handle.stop();

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const first = calls[0]!;
    expect(first.url).toContain("/internal/v1/tasks/te-hb/heartbeat");
    const headers = first.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer exec-token");
    const body = JSON.parse(String(first.init?.body));
    expect(body.extendBySeconds).toBe(HEARTBEAT_EXTEND_SECONDS);
  });
});

describe("postCompleteTask", () => {
  test("sends AgentResult with idempotency key", async () => {
    let captured: unknown;
    const fetchFn = mock(async (_url: string | URL, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ duplicate: false }), { status: 200 });
    });

    const result = assembleBackendEngineerResult(
      sampleContext,
      ["out.ts"],
      Date.now(),
      { input: 1, output: 2 },
    );

    const res = await postCompleteTask({
      engineUrl: "http://127.0.0.1:3999",
      taskExecutionId: "te-complete",
      agentId: "a-1",
      executionToken: "tok",
      result,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(res.ok).toBe(true);
    const body = captured as {
      idempotencyKey: string;
      agentId: string;
      result: { status: string };
    };
    expect(body.agentId).toBe("a-1");
    expect(body.result.status).toBe("COMPLETED");
    expect(body.idempotencyKey).toContain("te-complete");
  });
});
