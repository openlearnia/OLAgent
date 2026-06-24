import { McpClient } from "@olagent/mcp-proxy";
import type { ContextBundle } from "@olagent/workflow-engine";
import { handleFilesystemMethod } from "./handlers/filesystem.ts";
import { handleTerminalMethod } from "./handlers/terminal.ts";
import {
  acpAuthenticate,
  acpInitialize,
  acpSessionNew,
  acpSessionPrompt,
} from "./lifecycle.ts";
import {
  collectSessionUpdate,
  type SessionUpdate,
} from "./outcome.ts";
import { buildSessionPrompt } from "./prompt.ts";
import {
  evaluatePermission,
  permissionResponse,
  resolvePermissionMode,
  type PermissionParams,
} from "./permission.ts";
import { JsonRpcTransport } from "./transport.ts";

export interface AcpClientOptions {
  bundle: ContextBundle;
  transport: JsonRpcTransport;
  mcp: McpClient;
  skipAuthenticate?: boolean;
  permissionMode?: ReturnType<typeof resolvePermissionMode>;
}

export interface AcpClientRunResult {
  acpSessionId: string;
  stopReason?: string;
  updates: SessionUpdate[];
}

const FS_METHOD_PREFIXES = ["fs/", "filesystem/"];
const TERMINAL_METHOD_PREFIXES = ["terminal/"];

function isFsMethod(method: string): boolean {
  return FS_METHOD_PREFIXES.some((p) => method.startsWith(p));
}

function isTerminalMethod(method: string): boolean {
  return TERMINAL_METHOD_PREFIXES.some((p) => method.startsWith(p));
}

/**
 * ACP client role — lifecycle + inbound agent request handlers.
 */
export class AcpClient {
  private readonly bundle: ContextBundle;
  private readonly transport: JsonRpcTransport;
  private readonly mcp: McpClient;
  private readonly permissionMode: ReturnType<typeof resolvePermissionMode>;
  private readonly skipAuthenticate: boolean;
  private started = false;
  readonly updates: SessionUpdate[] = [];

  constructor(options: AcpClientOptions) {
    this.bundle = options.bundle;
    this.transport = options.transport;
    this.mcp = options.mcp;
    this.permissionMode = options.permissionMode ?? resolvePermissionMode();
    this.skipAuthenticate = options.skipAuthenticate ?? false;
  }

  attachTransportHandlers(): void {
    if (!this.started) {
      this.transport.start();
      this.started = true;
    }
  }

  async run(): Promise<AcpClientRunResult> {
    this.attachTransportHandlers();

    await acpInitialize(this.transport);

    if (!this.skipAuthenticate && process.env.CURSOR_API_KEY) {
      await acpAuthenticate(this.transport).catch(() => undefined);
    }

    const cwd = this.bundle.context.workspace;
    const { sessionId } = await acpSessionNew(this.transport, cwd);
    const prompt = buildSessionPrompt(this.bundle);
    const promptResult = await acpSessionPrompt(this.transport, sessionId, prompt);

    return {
      acpSessionId: sessionId,
      stopReason: promptResult.stopReason,
      updates: [...this.updates],
    };
  }

  async handleAgentRequest(
    method: string,
    params: unknown,
    id: number | string,
  ): Promise<unknown> {
    const record = (params ?? {}) as Record<string, unknown>;

    if (method === "session/update") {
      collectSessionUpdate(this.updates, method, params);
      return undefined;
    }

    if (method === "session/request_permission") {
      const decision = evaluatePermission(
        record as PermissionParams,
        this.bundle.context.workspace,
        this.permissionMode,
      );
      return permissionResponse(decision);
    }

    if (method === "permission/request") {
      const decision = evaluatePermission(
        record as PermissionParams,
        this.bundle.context.workspace,
        this.permissionMode,
      );
      return { approved: decision.approved, reason: decision.reason };
    }

    if (isFsMethod(method)) {
      return handleFilesystemMethod(method, record, { mcp: this.mcp });
    }

    if (isTerminalMethod(method)) {
      return handleTerminalMethod(method, record, { mcp: this.mcp });
    }

    if (method.startsWith("cursor/")) {
      return this.handleCursorExtension(method, record);
    }

    throw new Error(`Unhandled ACP agent request: ${method} (id=${id})`);
  }

  onNotification(method: string, params: unknown): void {
    if (method === "session/update") {
      collectSessionUpdate(this.updates, method, params);
    }
  }

  private handleCursorExtension(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case "cursor/ask_question":
        return {
          outcome: {
            outcome: "skipped",
            reason: "autonomous factory — no operator present",
          },
        };
      case "cursor/create_plan":
        return { outcome: { outcome: "accepted" } };
      case "cursor/update_todos":
      case "cursor/task":
      case "cursor/generate_image":
        return undefined;
      default:
        return { outcome: { outcome: "rejected", reason: "unsupported extension" } };
    }
  }
}

export function createAcpTransportHandlers(client: AcpClient): {
  onNotification: (method: string, params: unknown) => void;
  onRequest: (method: string, params: unknown, id: number | string) => Promise<unknown>;
} {
  return {
    onNotification: (method, params) => client.onNotification(method, params),
    onRequest: (method, params, id) => client.handleAgentRequest(method, params, id),
  };
}
