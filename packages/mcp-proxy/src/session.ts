import { McpProxyError, mcpErrorResponse, mcpSuccessResponse } from "./errors.ts";
import { isToolAuthorized, listAuthorizedTools } from "./contracts.ts";
import { appendAuditLog } from "./audit.ts";
import { vaultGet } from "./vault.ts";
import * as fs from "./adapters/filesystem.ts";
import * as git from "./adapters/git.ts";
import * as terminal from "./adapters/terminal.ts";

export interface McpSessionConfig {
  sessionId: string;
  taskExecutionId: string;
  workspace: string;
  agentType: string;
}

export interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export type ToolCallResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export class McpProxySession {
  readonly sessionId: string;
  readonly taskExecutionId: string;
  readonly workspace: string;
  readonly agentType: string;

  constructor(config: McpSessionConfig) {
    this.sessionId = config.sessionId;
    this.taskExecutionId = config.taskExecutionId;
    this.workspace = config.workspace;
    this.agentType = config.agentType;
  }

  listTools(): string[] {
    return listAuthorizedTools(this.agentType);
  }

  async callTool(req: ToolCallRequest): Promise<ToolCallResponse> {
    const started = Date.now();
    const params = req.arguments ?? {};
    const tool = req.name;

    const auditBase = {
      sessionId: this.sessionId,
      agentType: this.agentType,
      tool,
      params: params as Record<string, unknown>,
    };

    if (!isToolAuthorized(this.agentType, tool)) {
      const error = { code: "TOOL_NOT_AUTHORIZED", message: `Tool ${tool} not authorized for ${this.agentType}` };
      await appendAuditLog(this.workspace, {
        ...auditBase,
        error,
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      });
      return mcpErrorResponse("TOOL_NOT_AUTHORIZED", error.message);
    }

    try {
      const data = await this.dispatchTool(tool, params);
      await appendAuditLog(this.workspace, {
        ...auditBase,
        result: summarizeResult(data),
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      });
      return mcpSuccessResponse(data);
    } catch (error) {
      const code =
        error instanceof McpProxyError ? error.code : "TOOL_ERROR";
      const message = error instanceof Error ? error.message : String(error);
      await appendAuditLog(this.workspace, {
        ...auditBase,
        error: { code, message },
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      });
      return mcpErrorResponse(code as McpProxyError["code"], message);
    }
  }

  private async dispatchTool(
    tool: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (tool) {
      case "filesystem.read":
        return { content: await fs.filesystemRead(this.workspace, String(params.path ?? "")) };
      case "filesystem.write":
        return fs.filesystemWrite(
          this.workspace,
          String(params.path ?? ""),
          String(params.content ?? ""),
        );
      case "filesystem.list":
        return fs.filesystemList(this.workspace, String(params.path ?? "."));
      case "git.status":
        return git.gitStatus(this.workspace);
      case "git.diff":
        return git.gitDiff(this.workspace, {
          path: params.path ? String(params.path) : undefined,
          staged: Boolean(params.staged),
        });
      case "terminal.run":
        return terminal.terminalRun(this.workspace, params.argv as string[]);
      case "vault.get":
        return vaultGet(
          String(params.secretRef ?? ""),
          this.sessionId,
          this.workspace,
        );
      case "browser.launch":
      case "browser.close":
      case "page_navigate":
        throw new McpProxyError("NOT_IMPLEMENTED", `${tool} is not implemented in M4`);
      default:
        throw new McpProxyError("TOOL_NOT_AUTHORIZED", `Unknown tool: ${tool}`);
    }
  }
}

function summarizeResult(data: unknown): unknown {
  if (data && typeof data === "object" && "value" in (data as object)) {
    return { ...data as object, value: "[REDACTED]" };
  }
  return data;
}
