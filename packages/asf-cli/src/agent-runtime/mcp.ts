import { McpClient } from "@olagent/mcp-proxy";
import type { ContextBundle } from "@olagent/workflow-engine";
import type { FetchFn } from "./heartbeat.ts";

export interface McpSessionHandle {
  client: McpClient;
  writeFile: (relativePath: string, content: string) => Promise<void>;
  readFile: (relativePath: string) => Promise<string>;
}

/**
 * Register MCP session and return a client for tool calls.
 */
export async function connectMcpSession(
  bundle: ContextBundle,
  fetchFn?: FetchFn,
): Promise<McpSessionHandle> {
  const endpoint = bundle.mcpEndpoint;
  if (!endpoint) {
    throw new Error("Context bundle missing mcpEndpoint — is MCP proxy running?");
  }

  const sessionId = bundle.sessionId ?? bundle.taskExecutionId;
  const client = new McpClient({
    endpoint,
    sessionId,
    taskExecutionId: bundle.taskExecutionId,
    workspace: bundle.context.workspace,
    agentType: bundle.agentType,
    fetchFn,
  });

  await client.registerSession({
    sessionId,
    taskExecutionId: bundle.taskExecutionId,
    workspace: bundle.context.workspace,
    agentType: bundle.agentType,
  });

  return {
    client,
    writeFile: (path, content) => client.filesystemWrite(path, content),
    readFile: (path) => client.filesystemRead(path),
  };
}
