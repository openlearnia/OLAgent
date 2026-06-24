import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertGitSubcommandAllowed,
  createInProcessSession,
  createMcpProxyServer,
  isTerminalArgvAllowed,
  McpClient,
} from "../src/index.ts";

describe("path jail", () => {
  test("rejects .. traversal", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "mcp-jail-"));
    try {
      const session = createInProcessSession({
        sessionId: "s1",
        taskExecutionId: "te1",
        workspace,
        agentType: "backend-engineer",
      });
      const result = await session.callTool({
        name: "filesystem.read",
        arguments: { path: "../../../etc/passwd" },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("PATH_OUT_OF_BOUNDS");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("allows write inside workspace", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "mcp-jail-"));
    try {
      const session = createInProcessSession({
        sessionId: "s2",
        taskExecutionId: "te2",
        workspace,
        agentType: "backend-engineer",
      });
      const write = await session.callTool({
        name: "filesystem.write",
        arguments: { path: "src/hello.ts", content: "export const x = 1;\n" },
      });
      expect(write.ok).toBe(true);

      const read = await session.callTool({
        name: "filesystem.read",
        arguments: { path: "src/hello.ts" },
      });
      expect(read.ok).toBe(true);
      if (read.ok) {
        expect((read.data as { content: string }).content).toContain("export const x");
      }
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("git denylist", () => {
  test("blocks push subcommand", () => {
    expect(() => assertGitSubcommandAllowed("push")).toThrow();
  });

  test("allows status", () => {
    expect(() => assertGitSubcommandAllowed("status")).not.toThrow();
  });
});

describe("terminal allowlist", () => {
  test("allows bun", () => {
    expect(isTerminalArgvAllowed(["bun", "test"])).toBe(true);
  });

  test("rejects curl", () => {
    expect(isTerminalArgvAllowed(["curl", "https://evil.example"])).toBe(false);
  });

  test("rejects rm -rf /", () => {
    expect(isTerminalArgvAllowed(["rm", "-rf", "/"])).toBe(false);
  });
});

describe("tool authorization", () => {
  test("denies deployment.deploy for backend-engineer", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "mcp-auth-"));
    try {
      const session = createInProcessSession({
        sessionId: "s3",
        taskExecutionId: "te3",
        workspace,
        agentType: "backend-engineer",
      });
      const result = await session.callTool({
        name: "deployment.deploy",
        arguments: {},
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("TOOL_NOT_AUTHORIZED");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("audit log", () => {
  test("appends JSONL on tool call", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "mcp-audit-"));
    const sessionId = "audit-session";
    try {
      const session = createInProcessSession({
        sessionId,
        taskExecutionId: sessionId,
        workspace,
        agentType: "backend-engineer",
      });
      await session.callTool({
        name: "filesystem.write",
        arguments: { path: "out.txt", content: "audited" },
      });

      const logPath = path.join(workspace, ".asf", "audit", `${sessionId}.jsonl`);
      expect(await Bun.file(logPath).exists()).toBe(true);
      const text = await Bun.file(logPath).text();
      const line = JSON.parse(text.trim().split("\n").pop()!);
      expect(line.tool).toBe("filesystem.write");
      expect(line.sessionId).toBe(sessionId);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("HTTP integration", () => {
  test("agent writes file via MCP client only", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "mcp-http-"));
    const server = createMcpProxyServer({ port: 0 });
    const sessionId = "http-session";

    try {
      const client = new McpClient({
        endpoint: server.url,
        sessionId,
        taskExecutionId: sessionId,
        workspace,
        agentType: "backend-engineer",
      });
      await client.registerSession({
        sessionId,
        taskExecutionId: sessionId,
        workspace,
        agentType: "backend-engineer",
      });
      await client.filesystemWrite("packages/api/src/routes/contacts.ts", "// mcp\n");

      const file = path.join(workspace, "packages/api/src/routes/contacts.ts");
      expect(await Bun.file(file).exists()).toBe(true);

      const logPath = path.join(workspace, ".asf", "audit", `${sessionId}.jsonl`);
      expect(await Bun.file(logPath).exists()).toBe(true);
    } finally {
      server.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
