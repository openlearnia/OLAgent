import type { WorkflowEngine } from "../engine/engine.ts";
import { hashPayload } from "../engine/db.ts";
import type { WorkflowEvent } from "../types.ts";
import { StubAgentRuntime } from "./stub.ts";

/**
 * In-process stub agent completion for local dev / CI (`ASF_USE_STUB_AGENTS=1`).
 * Subscribes to `task.scheduled` and auto-completes agent tasks via StubAgentRuntime.
 */
export function wireStubAgentRuntime(engine: WorkflowEngine): () => void {
  const stub = new StubAgentRuntime();

  return engine.getEventBus().subscribe((event: WorkflowEvent) => {
    if (event.type !== "task.scheduled") return;

    const payload = event.payload as {
      tasks?: Array<{
        taskId: string;
        taskExecutionId: string;
        agentType: string;
      }>;
    };
    const items = payload.tasks ?? [];

    for (const item of items) {
      if (item.agentType === "gate-runner") continue;

      const store = engine.getStore();
      const execution = store.getExecution(item.taskExecutionId);
      if (!execution || execution.status !== "RUNNING") continue;

      const task = store.getTask(event.missionId, item.taskId);
      if (!task || task.kind === "gate") continue;

      engine.heartbeat(item.taskExecutionId);
      const result = stub.run(task, event.missionId);
      const idempotencyKey = `stub:${item.taskExecutionId}:${hashPayload(result)}`;

      try {
        engine.completeTask(item.taskExecutionId, { idempotencyKey, result });
      } catch (error) {
        console.error(
          `[stub-agent] completeTask failed for ${item.taskExecutionId}:`,
          error,
        );
      }
    }
  });
}
