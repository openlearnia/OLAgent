import type { EngineError } from "../types.ts";

export function isEngineError(error: unknown): error is EngineError {
  return (
    error instanceof Error &&
    typeof (error as EngineError).code === "string"
  );
}

export function engineErrorStatus(code: string): number {
  switch (code) {
    case "MISSION_NOT_FOUND":
    case "EXECUTION_NOT_FOUND":
    case "TASK_NOT_FOUND":
      return 404;
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "INVALID_TRANSITION":
    case "INVALID_INPUT":
      return 400;
    default:
      return 500;
  }
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}
