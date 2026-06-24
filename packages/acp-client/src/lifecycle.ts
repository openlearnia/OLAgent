import type { JsonRpcTransport } from "./transport.ts";

export interface InitializeResult {
  protocolVersion?: number;
  agentCapabilities?: Record<string, unknown>;
}

export interface SessionNewResult {
  sessionId: string;
}

export interface SessionPromptResult {
  stopReason?: string;
}

export async function acpInitialize(transport: JsonRpcTransport): Promise<InitializeResult> {
  const result = (await transport.request("initialize", {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
    clientInfo: { name: "olagent-acp-client", version: "0.1.0" },
  })) as InitializeResult;
  return result;
}

export async function acpSessionNew(
  transport: JsonRpcTransport,
  cwd: string,
): Promise<SessionNewResult> {
  const result = (await transport.request("session/new", {
    cwd,
    mcpServers: [],
  })) as SessionNewResult;

  if (!result?.sessionId) {
    throw new Error("ACP session/new missing sessionId");
  }
  return result;
}

export async function acpSessionPrompt(
  transport: JsonRpcTransport,
  sessionId: string,
  prompt: Array<{ type: string; text: string }>,
): Promise<SessionPromptResult> {
  return (await transport.request("session/prompt", {
    sessionId,
    prompt,
  })) as SessionPromptResult;
}

export async function acpAuthenticate(
  transport: JsonRpcTransport,
  methodId = "cursor_login",
): Promise<unknown> {
  return transport.request("authenticate", { methodId });
}
