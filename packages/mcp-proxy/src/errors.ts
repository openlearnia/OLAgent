export type McpErrorCode =
  | "PATH_OUT_OF_BOUNDS"
  | "TOOL_NOT_AUTHORIZED"
  | "COMMAND_NOT_ALLOWLISTED"
  | "GIT_COMMAND_DENIED"
  | "SESSION_NOT_FOUND"
  | "NOT_IMPLEMENTED"
  | "INVALID_INPUT"
  | "TOOL_ERROR";

export class McpProxyError extends Error {
  readonly code: McpErrorCode;

  constructor(code: McpErrorCode, message: string) {
    super(message);
    this.name = "McpProxyError";
    this.code = code;
  }
}

export function mcpErrorResponse(code: McpErrorCode, message: string) {
  return { ok: false as const, error: { code, message } };
}

export function mcpSuccessResponse<T>(data: T) {
  return { ok: true as const, data };
}
