import type { AgentContext } from "@olagent/workflow-engine";
import type { AgentResult } from "@olagent/workflow-engine";
import { validateAgentResult } from "@olagent/workflow-engine";

export function targetArtifactForTask(
  taskType: string,
  taskId: string,
): string {
  switch (taskType) {
    case "implement-backend":
      return "packages/api/src/routes/contacts.ts";
    case "schema-migration":
      return "packages/api/migrations/001_contacts.sql";
    default:
      return `src/generated/${taskId}.ts`;
  }
}

export function assembleBackendEngineerResult(
  context: AgentContext,
  artifacts: string[],
  startedAt: number,
  tokenUsage: { input: number; output: number },
  summary?: string,
): AgentResult {
  const task = context.task;
  const result: AgentResult = {
    status: "COMPLETED",
    artifacts,
    commits: [],
    summary:
      summary ??
      `backend-engineer completed ${task.type} (${task.id}): ${artifacts.join(", ")}`,
    metrics: {
      tokenUsage,
      durationMs: Date.now() - startedAt,
    },
  };
  return validateAgentResult(result);
}

export function assembleFailureResult(
  code: string,
  message: string,
  recoverable: boolean,
  startedAt: number,
): AgentResult {
  return validateAgentResult({
    status: "FAILED",
    artifacts: [],
    commits: [],
    summary: message,
    error: { code, message, recoverable },
    metrics: { tokenUsage: { input: 0, output: 0 }, durationMs: Date.now() - startedAt },
  });
}
