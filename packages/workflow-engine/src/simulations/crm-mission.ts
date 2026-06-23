import { WorkflowEngine } from "../engine/engine.ts";
import { hashPayload } from "../engine/db.ts";
import type { Mission, MissionStatus } from "../types.ts";
import { StubAgentRuntime, type StubAgentOptions } from "../agents/stub.ts";
import {
  CRM_CONSTRAINTS,
  CRM_HEALING_TEMPLATES,
  CRM_MISSION_ID,
  CRM_SEED_EDGES,
  CRM_SEED_NODES,
} from "../fixtures/crm-seed.ts";

export interface SimulationResult {
  mission: Mission;
  finalStatus: MissionStatus;
  steps: number;
  eventTypes: string[];
}

export interface RunCrmMissionOptions extends StubAgentOptions {
  missionId?: string;
}

export function runCrmMission(
  options: RunCrmMissionOptions = {},
  existingEngine?: WorkflowEngine,
): SimulationResult & { engine: WorkflowEngine } {
  const engine = existingEngine ?? new WorkflowEngine();
  const stub = new StubAgentRuntime(options);
  const missionId = options.missionId ?? CRM_MISSION_ID;

  const mission = engine.createMission({
    id: missionId,
    goal: "Build a CRM for small businesses",
    constraints: CRM_CONSTRAINTS,
    seedNodes: CRM_SEED_NODES,
    seedEdges: CRM_SEED_EDGES,
    healingTemplates: CRM_HEALING_TEMPLATES,
  });

  engine.startMission(mission.id);

  let steps = 0;
  const maxSteps = 200;

  while (steps < maxSteps) {
    const store = engine.getStore();
    const running = store
      .listExecutions(mission.id)
      .filter((e) => e.status === "RUNNING");

    if (running.length === 0) {
      const pending = store.listTasks(mission.id).filter((t) => {
        const latest = store.latestExecution(mission.id, t.id);
        return latest?.status === "PENDING" || latest?.status === "WAITING";
      });
      if (pending.length === 0) break;

      engine.scheduleTasks({
        missionId: mission.id,
        trigger: "continuation",
        triggerEventId: `continuation-${steps}`,
        idempotencyKey: `schedule:${mission.id}:continuation-${steps}`,
      });
      steps++;
      continue;
    }

    for (const exec of running) {
      const task = store.getTask(mission.id, exec.taskId);
      if (!task || task.kind === "gate") continue;

      engine.heartbeat(exec.id);
      const result = stub.run(task, mission.id);
      const idempotencyKey = `complete:${exec.id}:${hashPayload(result)}`;
      engine.completeTask(exec.id, { idempotencyKey, result });
      steps++;
    }

    const updated = engine.getStore().getMission(mission.id);
    if (updated?.status === "SUCCESS") break;
  }

  const store = engine.getStore();
  const finalMission = store.getMission(mission.id)!;
  const eventTypes = store.listEvents(mission.id).map((e) => e.type);

  return {
    mission: finalMission,
    finalStatus: finalMission.status,
    steps,
    eventTypes,
    engine,
  };
}
