import type { WorkflowEngine } from "../engine/engine.ts";
import type {
  AgentResult,
  CompleteTaskRequest,
  ScheduleTasksRequest,
} from "../types.ts";
import {
  engineErrorStatus,
  isEngineError,
  jsonError,
} from "./errors.ts";

export interface MissionProjection {
  mission: {
    id: string;
    goal: string;
    status: string;
    workspacePath: string;
    createdAt: string;
    completedAt?: string;
  };
  tasks: Array<{
    id: string;
    type: string;
    title: string;
    kind: string;
    assignedAgentType: string;
    status: string;
    taskExecutionId?: string;
  }>;
}


export async function handleStartMission(
  engine: WorkflowEngine,
  missionId: string,
): Promise<Response> {
  try {
    const result = engine.startMission(missionId);
    return Response.json(result);
  } catch (error) {
    return mapEngineError(error);
  }
}

export async function handleCompleteTask(
  engine: WorkflowEngine,
  taskExecutionId: string,
  body: unknown,
): Promise<Response> {
  const parsed = parseCompleteTaskBody(body);
  if (!parsed.ok) return parsed.response;

  try {
    const result = engine.completeTask(taskExecutionId, parsed.request);
    return Response.json(result);
  } catch (error) {
    return mapEngineError(error);
  }
}

export async function handleHeartbeat(
  engine: WorkflowEngine,
  taskExecutionId: string,
  body: unknown,
): Promise<Response> {
  const extendBySeconds =
    typeof body === "object" &&
    body !== null &&
    "extendBySeconds" in body &&
    typeof (body as { extendBySeconds?: unknown }).extendBySeconds === "number"
      ? (body as { extendBySeconds: number }).extendBySeconds
      : 120;

  try {
    engine.heartbeat(taskExecutionId, extendBySeconds);
    const execution = engine.getStore().getExecution(taskExecutionId);
    if (!execution) {
      return jsonError(404, "EXECUTION_NOT_FOUND", taskExecutionId);
    }
    return Response.json({
      taskExecutionId,
      leaseExpiresAt: execution.leaseExpiresAt,
    });
  } catch (error) {
    return mapEngineError(error);
  }
}

export async function handleSchedule(
  engine: WorkflowEngine,
  body: unknown,
): Promise<Response> {
  const parsed = parseScheduleBody(body);
  if (!parsed.ok) return parsed.response;

  try {
    const result = engine.scheduleTasks(parsed.request);
    return Response.json(result);
  } catch (error) {
    return mapEngineError(error);
  }
}

export function handleGetMission(
  engine: WorkflowEngine,
  missionId: string,
): Response {
  const store = engine.getStore();
  const mission = store.getMission(missionId);
  if (!mission) {
    return jsonError(404, "MISSION_NOT_FOUND", missionId);
  }

  const tasks = store.listTasks(missionId).map((task) => {
    const latest = store.latestExecution(missionId, task.id);
    return {
      id: task.id,
      type: task.type,
      title: task.title,
      kind: task.kind,
      assignedAgentType: task.assignedAgentType,
      status: latest?.status ?? "PENDING",
      taskExecutionId: latest?.id,
    };
  });

  const projection: MissionProjection = {
    mission: {
      id: mission.id,
      goal: mission.goal,
      status: mission.status,
      workspacePath: mission.workspacePath,
      createdAt: mission.createdAt,
      completedAt: mission.completedAt,
    },
    tasks,
  };

  return Response.json(projection);
}

export function handleGetMissionEvents(
  engine: WorkflowEngine,
  missionId: string,
  url: URL,
): Response {
  const store = engine.getStore();
  const mission = store.getMission(missionId);
  if (!mission) {
    return jsonError(404, "MISSION_NOT_FOUND", missionId);
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
  const events = store.listEvents(missionId);
  const slice = Number.isFinite(limit) && limit > 0 ? events.slice(-limit) : events;

  if (url.searchParams.get("stream") === "true") {
    const payload = slice.map((event) => JSON.stringify(event)).join("\n");
    return new Response(payload, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  }

  return Response.json({ events: slice });
}

function parseCompleteTaskBody(
  body: unknown,
):
  | { ok: true; request: CompleteTaskRequest }
  | { ok: false; response: Response } {
  if (typeof body !== "object" || body === null) {
    return {
      ok: false,
      response: jsonError(400, "INVALID_INPUT", "Request body must be a JSON object"),
    };
  }

  const record = body as Record<string, unknown>;
  if (typeof record.idempotencyKey !== "string" || !record.idempotencyKey) {
    return {
      ok: false,
      response: jsonError(400, "INVALID_INPUT", "idempotencyKey is required"),
    };
  }
  if (!isAgentResult(record.result)) {
    return {
      ok: false,
      response: jsonError(400, "INVALID_INPUT", "result must be a valid AgentResult"),
    };
  }

  return {
    ok: true,
    request: {
      idempotencyKey: record.idempotencyKey,
      agentId: typeof record.agentId === "string" ? record.agentId : undefined,
      result: record.result,
    },
  };
}

function parseScheduleBody(
  body: unknown,
):
  | { ok: true; request: ScheduleTasksRequest }
  | { ok: false; response: Response } {
  if (typeof body !== "object" || body === null) {
    return {
      ok: false,
      response: jsonError(400, "INVALID_INPUT", "Request body must be a JSON object"),
    };
  }

  const record = body as Record<string, unknown>;
  if (typeof record.missionId !== "string" || !record.missionId) {
    return {
      ok: false,
      response: jsonError(400, "INVALID_INPUT", "missionId is required"),
    };
  }
  if (typeof record.triggerEventId !== "string" || !record.triggerEventId) {
    return {
      ok: false,
      response: jsonError(400, "INVALID_INPUT", "triggerEventId is required"),
    };
  }
  if (typeof record.idempotencyKey !== "string" || !record.idempotencyKey) {
    return {
      ok: false,
      response: jsonError(400, "INVALID_INPUT", "idempotencyKey is required"),
    };
  }

  const trigger =
    typeof record.trigger === "string" && record.trigger
      ? record.trigger
      : "manual.schedule";

  return {
    ok: true,
    request: {
      missionId: record.missionId,
      triggerEventId: record.triggerEventId,
      idempotencyKey: record.idempotencyKey,
      trigger,
      force: record.force === true,
    },
  };
}

function isAgentResult(value: unknown): value is AgentResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as AgentResult;
  return (
    (result.status === "COMPLETED" || result.status === "FAILED") &&
    Array.isArray(result.artifacts) &&
    Array.isArray(result.commits) &&
    typeof result.summary === "string"
  );
}

function mapEngineError(error: unknown): Response {
  if (isEngineError(error)) {
    return jsonError(
      engineErrorStatus(error.code),
      error.code,
      error.message,
    );
  }
  return jsonError(500, "INTERNAL_ERROR", "Unexpected server error");
}

export function notFound(): Response {
  return jsonError(404, "NOT_FOUND", "Route not found");
}

export function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export function methodNotAllowed(): Response {
  return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}

export function badJson(): Response {
  return jsonError(400, "INVALID_INPUT", "Invalid JSON body");
}
