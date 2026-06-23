import type { Task, WorkflowEdge } from "../types.ts";
import { engineError } from "../types.ts";
import { validateTasksPlan, type TasksPlan } from "../schemas/validators.ts";
import type { Store } from "./store.ts";
import { createPendingExecution } from "./store.ts";

const KNOWN_IMPL_TYPES = new Set([
  "setup-repo",
  "schema-migration",
  "implement-backend",
  "implement-frontend",
  "implement-infra",
  "write-tests",
  "browser-test",
  "deploy",
  "verify-deployment",
]);

const GATE_PARENT_TYPES = new Set([
  "schema-migration",
  "implement-backend",
  "implement-frontend",
  "implement-infra",
]);

function detectCycle(tasks: TasksPlan["tasks"]): boolean {
  const graph = new Map<string, string[]>();
  for (const t of tasks) graph.set(t.id, t.dependencies);
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (dfs(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const t of tasks) {
    if (dfs(t.id)) return true;
  }
  return false;
}

export function mergePlanIntoDag(
  store: Store,
  missionId: string,
  planJson: unknown,
  planTaskId = "t-plan",
): { mergedTaskIds: string[]; gateIds: string[] } {
  const plan = validateTasksPlan(planJson);
  if (plan.missionId !== missionId) {
    throw engineError(
      "PLAN_MISSION_MISMATCH",
      `Plan missionId ${plan.missionId} != ${missionId}`,
    );
  }

  for (const t of plan.tasks) {
    if (!KNOWN_IMPL_TYPES.has(t.type)) {
      throw engineError("UNKNOWN_TASK_TYPE", `Unknown task type: ${t.type}`);
    }
  }

  if (detectCycle(plan.tasks)) {
    throw engineError("PLAN_CYCLE", "plan.json contains dependency cycle");
  }

  const existing = new Set(store.listTasks(missionId).map((t) => t.id));
  for (const t of plan.tasks) {
    if (existing.has(t.id)) {
      throw engineError("PLAN_COLLISION", `Task id collision: ${t.id}`);
    }
  }

  const mergedTaskIds: string[] = [];
  const gateIds: string[] = [];
  const gateForTask = new Map<string, string>();

  for (const pt of plan.tasks) {
    const task: Task = {
      id: pt.id,
      missionId,
      kind: "task",
      type: pt.type,
      title: pt.title,
      description: pt.description,
      assignedAgentType: pt.assignedAgentType,
      dependencies: pt.dependencies,
      acceptanceCriteria: pt.acceptanceCriteria,
      parallelSafe: pt.parallelSafe ?? false,
      maxRetries: pt.maxRetries ?? 3,
      epicId: pt.epicId ?? undefined,
    };
    store.insertTask(task);
    store.insertExecution(createPendingExecution(task.id, missionId));
    mergedTaskIds.push(task.id);

    if (GATE_PARENT_TYPES.has(pt.type)) {
      const gateId = `gate-merge-${pt.id}`;
      gateForTask.set(pt.id, gateId);
      const gate: Task = {
        id: gateId,
        missionId,
        kind: "gate",
        type: "gate-merge",
        title: `Merge gate for ${pt.title}`,
        assignedAgentType: "system",
        dependencies: [pt.id],
        acceptanceCriteria: ["bun test", "secret-scan"],
        parallelSafe: true,
        maxRetries: 0,
        gateType: "merge",
        parentTaskId: pt.id,
      };
      store.insertTask(gate);
      store.insertExecution(createPendingExecution(gateId, missionId));
      gateIds.push(gateId);
      store.insertEdge({ missionId, from: pt.id, to: gateId, kind: "hard" });
    }
  }

  for (const pt of plan.tasks) {
    const rewiredDeps = pt.dependencies.map((d) => gateForTask.get(d) ?? d);
    for (const dep of rewiredDeps) {
      const edge: WorkflowEdge = {
        missionId,
        from: dep,
        to: pt.id,
        kind: "hard",
      };
      store.insertEdge(edge);
    }
  }

  const bootstrapIds = new Set([
    "t-discover",
    "t-research",
    "t-architecture",
    "t-plan",
  ]);
  const roots = plan.tasks.filter(
    (t) =>
      t.dependencies.length === 0 ||
      t.dependencies.every((d) => bootstrapIds.has(d)),
  );
  for (const root of roots) {
    store.insertEdge({
      missionId,
      from: planTaskId,
      to: root.id,
      kind: "hard",
    });
  }

  return { mergedTaskIds, gateIds };
}
