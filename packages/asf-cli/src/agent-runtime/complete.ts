import { hashPayload } from "@olagent/workflow-engine";
import type { AgentResult } from "@olagent/workflow-engine";
import type { FetchFn } from "./heartbeat.ts";

export interface CompleteTaskOptions {
  engineUrl: string;
  taskExecutionId: string;
  agentId: string;
  executionToken: string;
  result: AgentResult;
  fetchFn?: FetchFn;
}

export function buildCompleteIdempotencyKey(
  taskExecutionId: string,
  result: AgentResult,
): string {
  return `complete:${taskExecutionId}:${hashPayload(result)}`;
}

/**
 * Agent-side POST /internal/v1/tasks/:taskExecutionId/complete (M3).
 */
export async function postCompleteTask(
  options: CompleteTaskOptions,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const fetchFn = options.fetchFn ?? fetch;
  const idempotencyKey = buildCompleteIdempotencyKey(
    options.taskExecutionId,
    options.result,
  );

  const res = await fetchFn(
    `${options.engineUrl}/internal/v1/tasks/${options.taskExecutionId}/complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.executionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey,
        agentId: options.agentId,
        result: options.result,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      message: text || res.statusText,
    };
  }

  return { ok: true };
}
