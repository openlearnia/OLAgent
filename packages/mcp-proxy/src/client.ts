import { McpProxySession, type McpSessionConfig, type ToolCallRequest } from "./session.ts";

export interface McpClientOptions {
  endpoint: string;
  sessionId: string;
  taskExecutionId: string;
  workspace: string;
  agentType: string;
  fetchFn?: typeof fetch;
}

/**
 * HTTP client for MCP proxy — used by `asf agent run` subprocess.
 */
export class McpClient {
  private readonly endpoint: string;
  private readonly sessionId: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: McpClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.sessionId = options.sessionId;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  static fromSessionConfig(
    endpoint: string,
    config: McpSessionConfig,
    fetchFn?: typeof fetch,
  ): McpClient {
    return new McpClient({
      endpoint,
      sessionId: config.sessionId,
      taskExecutionId: config.taskExecutionId,
      workspace: config.workspace,
      agentType: config.agentType,
      fetchFn,
    });
  }

  async registerSession(config: McpSessionConfig): Promise<void> {
    const res = await this.fetchFn(`${this.endpoint}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MCP session register failed (${res.status}): ${text}`);
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const req: ToolCallRequest = { name, arguments: args };
    const res = await this.fetchFn(`${this.endpoint}/v1/tools/call`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mcp-session-id": this.sessionId,
      },
      body: JSON.stringify({ sessionId: this.sessionId, ...req }),
    });

    const body = (await res.json()) as {
      ok: boolean;
      data?: unknown;
      error?: { code: string; message: string };
    };

    if (!body.ok) {
      throw new Error(body.error?.message ?? `MCP tool ${name} failed`);
    }
    return body.data;
  }

  async filesystemWrite(path: string, content: string): Promise<void> {
    await this.callTool("filesystem.write", { path, content });
  }

  async filesystemRead(path: string): Promise<string> {
    const result = (await this.callTool("filesystem.read", { path })) as {
      content: string;
    };
    return result.content;
  }
}

/**
 * In-process session for unit tests (no HTTP).
 */
export function createInProcessSession(config: McpSessionConfig): McpProxySession {
  return new McpProxySession(config);
}
