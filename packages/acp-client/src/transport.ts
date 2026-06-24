import type { Subprocess } from "bun";
import {
  formatJsonRpcNotification,
  formatJsonRpcRequest,
  formatJsonRpcResponse,
  formatJsonRpcError,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  parseJsonRpcLine,
  type JsonRpcErrorObject,
  type JsonRpcMessage,
} from "./jsonrpc.ts";

export interface JsonRpcTransportOptions {
  onNotification?: (method: string, params: unknown) => void;
  onRequest?: (method: string, params: unknown, id: number | string) => Promise<unknown>;
  onProtocolError?: (error: Error) => void;
  logMessageTypes?: boolean;
}

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

/**
 * Newline-delimited JSON-RPC 2.0 transport over subprocess stdio.
 */
export class JsonRpcTransport {
  private nextId = 1;
  private readonly pending = new Map<number | string, PendingRequest>();
  private readonly options: JsonRpcTransportOptions;
  private readLoopPromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    private readonly stdin: { write: (chunk: Uint8Array) => void; close?: () => void },
    private readonly stdout: ReadableStream<Uint8Array>,
    options: JsonRpcTransportOptions = {},
  ) {
    this.options = options;
  }

  static fromSubprocess(
    proc: Subprocess<"pipe", "pipe", "pipe">,
    options?: JsonRpcTransportOptions,
  ): JsonRpcTransport {
    if (!proc.stdin || !proc.stdout) {
      throw new Error("ACP spawn requires piped stdin/stdout");
    }
    return new JsonRpcTransport(proc.stdin, proc.stdout, options);
  }

  start(): void {
    if (this.readLoopPromise) return;
    this.readLoopPromise = this.readLoop();
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload = formatJsonRpcRequest(id, method, params);
    await this.write(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  notify(method: string, params?: unknown): Promise<void> {
    return this.write(formatJsonRpcNotification(method, params));
  }

  respond(id: number | string, result: unknown): Promise<void> {
    return this.write(formatJsonRpcResponse(id, result));
  }

  respondError(id: number | string, error: JsonRpcErrorObject): Promise<void> {
    return this.write(formatJsonRpcError(id, error));
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const [, waiter] of this.pending) {
      waiter.reject(new Error("ACP transport closed"));
    }
    this.pending.clear();
    if (this.stdin && "close" in this.stdin && typeof this.stdin.close === "function") {
      try {
        this.stdin.close();
      } catch {
        // ignore
      }
    }
    await this.readLoopPromise?.catch(() => undefined);
  }

  private async write(payload: string): Promise<void> {
    const bytes = new TextEncoder().encode(payload);
    if ("write" in this.stdin && typeof this.stdin.write === "function") {
      this.stdin.write(bytes);
      return;
    }
    const writer = (this.stdin as WritableStream<Uint8Array>).getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }

  private async readLoop(): Promise<void> {
    const reader = this.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          await this.handleLine(line);
        }
      }

      if (buffer.trim()) {
        await this.handleLine(buffer);
      }
    } catch (error) {
      if (!this.closed) {
        this.options.onProtocolError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async handleLine(line: string): Promise<void> {
    let msg: JsonRpcMessage;
    try {
      msg = parseJsonRpcLine(line);
    } catch (error) {
      this.options.onProtocolError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
      return;
    }

    if (this.options.logMessageTypes) {
      const kind = isJsonRpcResponse(msg)
        ? "response"
        : isJsonRpcNotification(msg)
          ? `notification:${msg.method}`
          : isJsonRpcRequest(msg)
            ? `request:${msg.method}`
            : "unknown";
      console.error(`[acp-client] ${kind}`);
    }

    if (isJsonRpcResponse(msg)) {
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        waiter.reject(new Error(msg.error.message ?? "ACP JSON-RPC error"));
      } else {
        waiter.resolve(msg.result);
      }
      return;
    }

    if (isJsonRpcNotification(msg)) {
      this.options.onNotification?.(msg.method, msg.params);
      return;
    }

    if (isJsonRpcRequest(msg) && msg.id !== undefined) {
      try {
        const result = await this.options.onRequest?.(msg.method, msg.params, msg.id);
        if (result !== undefined) {
          await this.respond(msg.id, result);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.respondError(msg.id, { code: -32000, message });
      }
    }
  }
}
