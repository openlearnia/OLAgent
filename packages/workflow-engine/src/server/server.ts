import { WorkflowEngine } from "../engine/engine.ts";
import {
  extractBearerToken,
  resolveJwtSecret,
  verifyInternalJwt,
} from "./auth.ts";
import {
  badJson,
  handleCompleteTask,
  handleGetMission,
  handleGetMissionEvents,
  handleHeartbeat,
  handleSchedule,
  handleStartMission,
  methodNotAllowed,
  notFound,
  unauthorized,
} from "./handlers.ts";

export interface WorkflowServerOptions {
  engine?: WorkflowEngine;
  port?: number;
  hostname?: string;
  jwtSecret?: string;
  dbPath?: string;
}

export interface WorkflowServer {
  server: ReturnType<typeof Bun.serve>;
  engine: WorkflowEngine;
  port: number;
  hostname: string;
  stop: () => void;
}

export function createWorkflowServer(
  options: WorkflowServerOptions = {},
): WorkflowServer {
  const engine =
    options.engine ??
    new WorkflowEngine({
      dbPath:
        options.dbPath ??
        process.env.WORKFLOW_DB_PATH ??
        ":memory:",
    });

  const jwtSecret = options.jwtSecret ?? resolveJwtSecret();
  const hostname = options.hostname ?? "127.0.0.1";
  const server = Bun.serve({
    hostname,
    port: options.port ?? Number(process.env.PORT ?? 3100),
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path.startsWith("/internal/v1/")) {
        const token = extractBearerToken(request.headers.get("authorization"));
        if (!token) return unauthorized();
        const claims = await verifyInternalJwt(token, jwtSecret);
        if (!claims) return unauthorized();
      }

      if (request.method === "POST" && path.match(/^\/internal\/v1\/missions\/[^/]+\/start$/)) {
        const missionId = path.split("/")[4]!;
        return handleStartMission(engine, missionId);
      }

      if (
        request.method === "POST" &&
        path.match(/^\/internal\/v1\/tasks\/[^/]+\/complete$/)
      ) {
        const taskExecutionId = path.split("/")[4]!;
        const body = await readJson(request);
        if (body === undefined) return badJson();
        return handleCompleteTask(engine, taskExecutionId, body);
      }

      if (
        request.method === "POST" &&
        path.match(/^\/internal\/v1\/tasks\/[^/]+\/heartbeat$/)
      ) {
        const taskExecutionId = path.split("/")[4]!;
        const body = await readJson(request);
        return handleHeartbeat(engine, taskExecutionId, body ?? {});
      }

      if (request.method === "POST" && path === "/internal/v1/schedule") {
        const body = await readJson(request);
        if (body === undefined) return badJson();
        return handleSchedule(engine, body);
      }

      if (request.method === "GET" && path.match(/^\/v1\/missions\/[^/]+\/events$/)) {
        const missionId = path.split("/")[3]!;
        return handleGetMissionEvents(engine, missionId, url);
      }

      if (request.method === "GET" && path.match(/^\/v1\/missions\/[^/]+$/)) {
        const missionId = path.split("/")[3]!;
        return handleGetMission(engine, missionId);
      }

      if (path.startsWith("/internal/") || path.startsWith("/v1/")) {
        return methodNotAllowed();
      }

      return notFound();
    },
  });

  return {
    server,
    engine,
    port: server.port!,
    hostname,
    stop: () => {
server.stop();
    },
  };
}

async function readJson(request: Request): Promise<unknown | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

