import { McpClient } from "@olagent/mcp-proxy";
import type { ContextBundle } from "@olagent/workflow-engine";
import type { Subprocess } from "bun";
import { AcpClient } from "./client.ts";
import { assembleSessionResult, type AcpSessionResult } from "./outcome.ts";
import { resolvePermissionMode } from "./permission.ts";
import { JsonRpcTransport } from "./transport.ts";

export interface RunCursorAcpSessionOptions {
  agentBin?: string;
  agentArgs?: string[];
  env?: Record<string, string | undefined>;
  skipAuthenticate?: boolean;
  permissionMode?: ReturnType<typeof resolvePermissionMode>;
  spawn?: typeof Bun.spawn;
  logMessageTypes?: boolean;
}

export function resolveCursorAgentBin(): string {
  return process.env.ASF_CURSOR_AGENT_BIN ?? "agent";
}

export async function connectMcpForBundle(bundle: ContextBundle): Promise<McpClient> {
  const endpoint = bundle.mcpEndpoint;
  if (!endpoint) {
    throw new Error("Context bundle missing mcpEndpoint");
  }

  const sessionId = bundle.sessionId ?? bundle.taskExecutionId;
  const client = new McpClient({
    endpoint,
    sessionId,
    taskExecutionId: bundle.taskExecutionId,
    workspace: bundle.context.workspace,
    agentType: bundle.agentType,
  });

  await client.registerSession({
    sessionId,
    taskExecutionId: bundle.taskExecutionId,
    workspace: bundle.context.workspace,
    agentType: bundle.agentType,
  });

  return client;
}

function buildAgentEnv(options: RunCursorAcpSessionOptions): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value !== undefined) env[key] = value;
  }
  if (process.env.CURSOR_API_KEY) {
    env.CURSOR_API_KEY = process.env.CURSOR_API_KEY;
  }
  delete env.ASF_INTERNAL_JWT_SECRET;
  return env;
}

export interface SpawnedAcpProcess {
  proc: Subprocess<"pipe", "pipe", "pipe">;
  transport: JsonRpcTransport;
  client: AcpClient;
  mcp: McpClient;
}

export function attachAcpClient(
  bundle: ContextBundle,
  proc: Subprocess<"pipe", "pipe", "pipe">,
  mcp: McpClient,
  options: RunCursorAcpSessionOptions = {},
): SpawnedAcpProcess {
  const clientRef: { current: AcpClient | null } = { current: null };
  const transport = JsonRpcTransport.fromSubprocess(proc, {
    onNotification: (method, params) => clientRef.current?.onNotification(method, params),
    onRequest: (method, params, id) => {
      if (!clientRef.current) {
        throw new Error("ACP client not ready for inbound request");
      }
      return clientRef.current.handleAgentRequest(method, params, id);
    },
    logMessageTypes: options.logMessageTypes,
    onProtocolError: (error) => {
      console.error(`[acp-client] protocol error: ${error.message}`);
    },
  });

  const client = new AcpClient({
    bundle,
    mcp,
    transport,
    skipAuthenticate: options.skipAuthenticate,
    permissionMode: options.permissionMode,
  });
  clientRef.current = client;
  transport.start();

  return { proc, transport, client, mcp };
}

/**
 * Spawn `agent acp`, run ACP lifecycle, delegate tool requests to MCP proxy.
 */
export async function runCursorAcpSession(
  bundle: ContextBundle,
  options: RunCursorAcpSessionOptions = {},
): Promise<AcpSessionResult> {
  const startedAt = Date.now();
  const spawnFn = options.spawn ?? Bun.spawn;
  const agentBin = options.agentBin ?? resolveCursorAgentBin();
  const agentArgs = options.agentArgs ?? ["acp"];

  let proc: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  let transport: JsonRpcTransport | null = null;

  try {
    const mcp = await connectMcpForBundle(bundle);

    proc = spawnFn({
      cmd: [agentBin, ...agentArgs],
      cwd: bundle.context.workspace,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: buildAgentEnv(options),
    }) as Subprocess<"pipe", "pipe", "pipe">;

    const attached = attachAcpClient(bundle, proc, mcp, options);
    transport = attached.transport;

    const runResult = await attached.client.run();

    if (proc.exitCode === null) {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    }
    const exitCode = await proc.exited;

    return assembleSessionResult({
      exitCode,
      acpSessionId: runResult.acpSessionId,
      stopReason: runResult.stopReason,
      updates: runResult.updates,
      startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exitCode = proc ? await proc.exited.catch(() => 1) : 1;

    return assembleSessionResult({
      exitCode,
      updates: [],
      startedAt,
      error: {
        code: message.includes("ACP_PROTOCOL") ? "ACP_PROTOCOL_ERROR" : "ACP_SESSION_FAILED",
        message,
        recoverable: true,
      },
    });
  } finally {
    await transport?.close();
    if (proc && proc.exitCode === null) {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    }
  }
}
