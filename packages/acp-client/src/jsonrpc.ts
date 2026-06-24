export const JSONRPC_VERSION = "2.0" as const;

export interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id?: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number | string;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

export interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export function isJsonRpcRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return "method" in msg && msg.id !== undefined && !("result" in msg) && !("error" in msg);
}

export function isJsonRpcResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return "id" in msg && ("result" in msg || "error" in msg);
}

export function isJsonRpcNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return "method" in msg && msg.id === undefined;
}

export function formatJsonRpcRequest(
  id: number | string,
  method: string,
  params?: unknown,
): string {
  return `${JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, method, params })}\n`;
}

export function formatJsonRpcResponse(id: number | string, result: unknown): string {
  return `${JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, result })}\n`;
}

export function formatJsonRpcError(
  id: number | string,
  error: JsonRpcErrorObject,
): string {
  return `${JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, error })}\n`;
}

export function formatJsonRpcNotification(method: string, params?: unknown): string {
  return `${JSON.stringify({ jsonrpc: JSONRPC_VERSION, method, params })}\n`;
}

export function parseJsonRpcLine(line: string): JsonRpcMessage {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("ACP_PROTOCOL_ERROR: empty JSON-RPC line");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("ACP_PROTOCOL_ERROR: invalid JSON on stdio line");
  }

  if (!parsed || typeof parsed !== "object" || (parsed as { jsonrpc?: string }).jsonrpc !== JSONRPC_VERSION) {
    throw new Error("ACP_PROTOCOL_ERROR: missing jsonrpc 2.0 envelope");
  }

  return parsed as JsonRpcMessage;
}
