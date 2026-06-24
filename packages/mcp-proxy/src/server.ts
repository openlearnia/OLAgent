import { McpProxySession, type McpSessionConfig } from "./session.ts";

export interface McpProxyServerOptions {
  hostname?: string;
  port?: number;
}

export interface McpProxyServer {
  hostname: string;
  port: number;
  url: string;
  stop: () => void;
  registerSession: (config: McpSessionConfig) => McpProxySession;
  getSession: (sessionId: string) => McpProxySession | undefined;
}

export function resolveMcpPort(): number {
  return Number(process.env.ASF_MCP_PORT ?? "3101");
}

export function resolveMcpEndpoint(hostname = "127.0.0.1", port?: number): string {
  const p = port ?? resolveMcpPort();
  return `http://${hostname}:${p}/mcp`;
}

export function createMcpProxyServer(
  options: McpProxyServerOptions = {},
): McpProxyServer {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;
  const sessions = new Map<string, McpProxySession>();

  const server = Bun.serve({
    hostname,
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "POST" && url.pathname === "/mcp/v1/sessions") {
        const body = (await req.json()) as McpSessionConfig;
        if (!body.sessionId || !body.workspace || !body.agentType) {
          return json({ ok: false, error: { code: "INVALID_INPUT", message: "missing session fields" } }, 400);
        }
        const session = new McpProxySession({
          sessionId: body.sessionId,
          taskExecutionId: body.taskExecutionId ?? body.sessionId,
          workspace: body.workspace,
          agentType: body.agentType,
        });
        sessions.set(body.sessionId, session);
        return json({ ok: true, data: { sessionId: body.sessionId } });
      }

      if (req.method === "GET" && url.pathname === "/mcp/v1/tools/list") {
        const sessionId =
          url.searchParams.get("sessionId") ??
          req.headers.get("x-mcp-session-id") ??
          "";
        const session = sessions.get(sessionId);
        if (!session) {
          return json({ ok: false, error: { code: "SESSION_NOT_FOUND", message: sessionId } }, 404);
        }
        return json({ ok: true, data: { tools: session.listTools() } });
      }

      if (req.method === "POST" && url.pathname === "/mcp/v1/tools/call") {
        const body = (await req.json()) as {
          sessionId?: string;
          name: string;
          arguments?: Record<string, unknown>;
        };
        const sessionId =
          body.sessionId ?? req.headers.get("x-mcp-session-id") ?? "";
        const session = sessions.get(sessionId);
        if (!session) {
          return json({ ok: false, error: { code: "SESSION_NOT_FOUND", message: sessionId } }, 404);
        }
        const result = await session.callTool({
          name: body.name,
          arguments: body.arguments,
        });
        const status = result.ok ? 200 : toolErrorStatus(result.error.code);
        return json(result, status);
      }

      if (url.pathname === "/mcp/health") {
        return json({ ok: true, data: { sessions: sessions.size } });
      }

      return json({ ok: false, error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    },
  });

  const baseUrl = `http://${server.hostname}:${server.port}/mcp`;

  return {
    hostname: server.hostname!,
    port: server.port,
    url: baseUrl,
    stop: () => server.stop(),
    registerSession(config: McpSessionConfig) {
      const session = new McpProxySession(config);
      sessions.set(config.sessionId, session);
      return session;
    },
    getSession(sessionId: string) {
      return sessions.get(sessionId);
    },
  };
}

function toolErrorStatus(code: string): number {
  switch (code) {
    case "TOOL_NOT_AUTHORIZED":
    case "COMMAND_NOT_ALLOWLISTED":
    case "GIT_COMMAND_DENIED":
    case "PATH_OUT_OF_BOUNDS":
      return 403;
    case "SESSION_NOT_FOUND":
      return 404;
    case "INVALID_INPUT":
      return 400;
    default:
      return 500;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
