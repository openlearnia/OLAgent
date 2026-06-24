import { describe, expect, test } from "bun:test";
import {
  formatJsonRpcRequest,
  formatJsonRpcResponse,
  parseJsonRpcLine,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcNotification,
} from "../src/jsonrpc.ts";

describe("JSON-RPC framing", () => {
  test("formatJsonRpcRequest appends newline", () => {
    const line = formatJsonRpcRequest(1, "initialize", { protocolVersion: 1 });
    expect(line.endsWith("\n")).toBe(true);
    const parsed = parseJsonRpcLine(line);
    expect(isJsonRpcRequest(parsed)).toBe(true);
    if (isJsonRpcRequest(parsed)) {
      expect(parsed.method).toBe("initialize");
      expect(parsed.id).toBe(1);
    }
  });

  test("parseJsonRpcLine rejects invalid JSON", () => {
    expect(() => parseJsonRpcLine("{not json")).toThrow(/ACP_PROTOCOL_ERROR/);
  });

  test("parseJsonRpcLine rejects missing jsonrpc version", () => {
    expect(() => parseJsonRpcLine('{"method":"x","id":1}')).toThrow(/jsonrpc 2.0/);
  });

  test("formatJsonRpcResponse round-trips", () => {
    const line = formatJsonRpcResponse(42, { sessionId: "s1" });
    const parsed = parseJsonRpcLine(line);
    expect(isJsonRpcResponse(parsed)).toBe(true);
    if (isJsonRpcResponse(parsed)) {
      expect(parsed.id).toBe(42);
      expect(parsed.result).toEqual({ sessionId: "s1" });
    }
  });

  test("detects notifications without id", () => {
    const line = `${JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: {} })}\n`;
    const parsed = parseJsonRpcLine(line);
    expect(isJsonRpcNotification(parsed)).toBe(true);
  });
});
