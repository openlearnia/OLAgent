import type { Task } from "../types.ts";
import { engineError } from "../types.ts";
import type { Store } from "./store.ts";
import { createPendingExecution } from "./store.ts";
import { assertTransition } from "./state-machine.ts";
import { newId, nowIso } from "./db.ts";

export interface GateRunResult {
  success: boolean;
  mergeCommit?: string;
  message?: string;
}

export function runMergeGate(_task: Task): GateRunResult {
  return {
    success: true,
    mergeCommit: `merged-${crypto.randomUUID().slice(0, 7)}`,
    message: "bun test + secret-scan passed (stub)",
  };
}

export function runGateForTask(
  store: Store,
  missionId: string,
  task: Task,
  executionId: string,
): GateRunResult {
  const execution = store.getExecution(executionId);
  if (!execution) throw new Error(`Execution ${executionId} not found`);
  if (execution.status !== "RUNNING") {
    throw engineError(
      "INVALID_TRANSITION",
      `Gate runner expected RUNNING, got ${execution.status}`,
    );
  }

  store.emitEvent({
    type: "gate.started",
    missionId,
    idempotencyKey: `gate.started:${executionId}`,
    payload: {
      gateId: task.id,
      gateType: task.gateType,
      parentTaskId: task.parentTaskId,
    },
  });

  const result =
    task.gateType === "merge"
      ? runMergeGate(task)
      : { success: true, message: "gate passed (stub)" };

  if (result.success) {
    store.updateExecution(executionId, {
      status: "SUCCESS",
      completedAt: nowIso(),
      result: {
        status: "COMPLETED",
        artifacts: [],
        commits: result.mergeCommit ? [result.mergeCommit] : [],
        summary: result.message ?? "Gate passed",
      },
    });
    store.emitEvent({
      type: "gate.completed",
      missionId,
      idempotencyKey: `gate.completed:${executionId}`,
      payload: {
        gateId: task.id,
        gateType: task.gateType,
        parentTaskId: task.parentTaskId,
        mergeCommit: result.mergeCommit,
      },
    });
  } else {
    store.updateExecution(executionId, {
      status: "FAILED",
      completedAt: nowIso(),
      result: {
        status: "FAILED",
        artifacts: [],
        commits: [],
        summary: result.message ?? "Gate failed",
        error: {
          code: "GATE_FAILED",
          message: result.message ?? "Gate failed",
          recoverable: false,
        },
      },
    });
    store.emitEvent({
      type: "gate.failed",
      missionId,
      idempotencyKey: `gate.failed:${executionId}`,
      payload: {
        gateId: task.id,
        gateType: task.gateType,
        message: result.message,
      },
    });
  }

  return result;
}

export function healingDedupKey(
  taskExecutionId: string,
  failureReportId: string,
): string {
  return `heal:${taskExecutionId}:${failureReportId}`;
}

export function materializeHealingChildren(
  store: Store,
  missionId: string,
  parentTaskId: string,
  iteration: number,
  maxIterations: number,
): { fixId: string; retestId: string } {
  const fixId = `healing-${parentTaskId}-fix-${iteration}`;
  const retestId = `healing-${parentTaskId}-retest-${iteration}`;

  store.insertTask({
    id: fixId,
    missionId,
    kind: "task",
    type: "heal-analyze-fix",
    title: `Fix iteration ${iteration} for ${parentTaskId}`,
    assignedAgentType: "fix",
    dependencies: [],
    acceptanceCriteria: ["Fix applied"],
    parallelSafe: false,
    maxRetries: 0,
    parentTaskId,
    healingParentTaskId: parentTaskId,
  });
  store.insertTask({
    id: retestId,
    missionId,
    kind: "task",
    type: "heal-retest",
    title: `Retest iteration ${iteration} for ${parentTaskId}`,
    assignedAgentType: "testing",
    dependencies: [fixId],
    acceptanceCriteria: ["Retest passes"],
    parallelSafe: false,
    maxRetries: 0,
    parentTaskId,
    healingParentTaskId: parentTaskId,
  });

  store.insertExecution(createPendingExecution(fixId, missionId));
  store.insertExecution(createPendingExecution(retestId, missionId));
  store.insertEdge({ missionId, from: fixId, to: retestId, kind: "hard" });

  store.emitEvent({
    type: "healing.iteration.started",
    missionId,
    idempotencyKey: `healing.started:${parentTaskId}:${iteration}`,
    payload: {
      parentTaskId,
      iteration,
      maxIterations,
      childTaskIds: [fixId, retestId],
    },
  });

  return { fixId, retestId };
}

export function handleHealingRetestComplete(
  store: Store,
  missionId: string,
  retestTaskId: string,
  passed: boolean,
): void {
  const retestTask = store.getTask(missionId, retestTaskId);
  if (!retestTask?.healingParentTaskId) return;

  const parentTaskId = retestTask.healingParentTaskId;
  const parentTask = store.getTask(missionId, parentTaskId);
  const parentExec = store.latestExecution(missionId, parentTaskId);
  if (!parentTask || !parentExec) return;

  const iteration = store.countHealingIterations(missionId, parentTaskId);
  const maxIterations = parentTask.maxRetries;

  if (passed) {
    const next = assertTransition(parentExec.status, "healing_retest_pass");
    store.updateExecution(parentExec.id, {
      status: next,
      completedAt: nowIso(),
      result: {
        status: "COMPLETED",
        artifacts: parentExec.result?.artifacts ?? [],
        commits: parentExec.result?.commits ?? [],
        summary: `Healed after iteration ${iteration}`,
      },
    });
    store.emitEvent({
      type: "healing.iteration.completed",
      missionId,
      idempotencyKey: `healing.completed:${parentTaskId}:${iteration}`,
      payload: {
        parentTaskId,
        iteration,
        outcome: "healed",
        retestResult: "pass",
      },
    });
    return;
  }

  if (iteration >= maxIterations) {
    const event =
      parentExec.result?.error?.recoverable !== false
        ? "retries_exhausted_blocked"
        : "retries_exhausted_failed";
    const next = assertTransition(parentExec.status, event);
    store.updateExecution(parentExec.id, { status: next });
    store.emitEvent({
      type: "task.blocked",
      missionId,
      idempotencyKey: `task.blocked:${parentExec.id}`,
      payload: {
        taskId: parentTaskId,
        reason: "retries_exhausted",
        message: `Healing exhausted after ${iteration} iterations`,
      },
    });
    return;
  }

  const mission = store.getMission(missionId);
  const backoff =
    mission?.constraints.retryBackoffMs ?? [0, 30_000, 120_000];
  const delay = backoff[Math.min(iteration, backoff.length - 1)] ?? 0;
  const nextEligibleAt = new Date(Date.now() + delay).toISOString();

  store.updateExecution(parentExec.id, {
    nextEligibleAt,
    status: "PENDING",
  });

  materializeHealingChildren(
    store,
    missionId,
    parentTaskId,
    iteration + 1,
    maxIterations,
  );
}

export function newFailureReportId(): string {
  return newId("fail-");
}
