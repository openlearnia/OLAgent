#!/usr/bin/env bun
/**
 * Minimal mock ACP agent for integration tests — speaks JSON-RPC on stdio.
 */
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin });

function send(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

rl.on("line", (line) => {
  const msg = JSON.parse(line) as {
    id?: number;
    method?: string;
    params?: Record<string, unknown>;
  };

  if (msg.id === undefined || !msg.method) return;

  switch (msg.method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { protocolVersion: 1, agentCapabilities: {} },
      });
      break;

    case "authenticate":
      send({ jsonrpc: "2.0", id: msg.id, result: { authenticated: true } });
      break;

    case "session/new":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { sessionId: "mock-acp-session-1" },
      });
      break;

    case "session/prompt": {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: msg.params?.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { text: "Wrote packages/api/src/routes/contacts.ts" },
          },
        },
      });

      send({
        jsonrpc: "2.0",
        method: "session/request_permission",
        params: { kind: "filesystem.write", path: "src/hello.ts" },
        id: 9001,
      });

      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { stopReason: "end_turn" },
      });
      break;
    }

    case "fs/read_text_file":
      send({
        jsonrpc: "2.0",
        method: "fs/read_text_file",
        params: { path: "README.md" },
        id: 9002,
      });
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: "mock file" },
      });
      break;

    default:
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {},
      });
  }
});
