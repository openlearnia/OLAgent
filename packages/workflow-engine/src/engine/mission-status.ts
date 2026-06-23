import type { Mission, MissionStatus, Task, TaskExecution } from "../types.ts";
import type { Store } from "./store.ts";
import { VerificationReportSchema } from "../schemas/validators.ts";

export function deriveMissionStatus(
  store: Store,
  mission: Mission,
): MissionStatus {
  const tasks = store.listTasks(mission.id);
  const executions = tasks
    .map((t) => store.latestExecution(mission.id, t.id))
    .filter((e): e is TaskExecution => e != null);

  if (executions.length === 0) return "PENDING";

  const statuses = executions.map((e) => e.status);
  const anyRunning = statuses.includes("RUNNING");
  const anyBlocked = statuses.includes("BLOCKED");
  const anyFailedTerminal = executions.some(
    (e) => e.status === "FAILED" && !hasRetriesRemaining(store, e),
  );
  const anyPendingOrWaiting = statuses.some(
    (s) => s === "PENDING" || s === "WAITING",
  );

  if (anyRunning || anyPendingOrWaiting) return "RUNNING";
  if (anyBlocked) return "BLOCKED";
  if (anyFailedTerminal) return "FAILED";

  const allSuccess = statuses.every((s) => s === "SUCCESS");
  if (!allSuccess) return "RUNNING";

  const verifyTask = tasks.find((t) => t.type === "verify-deployment");
  if (!verifyTask) return "RUNNING";

  const verifyExec = store.latestExecution(mission.id, verifyTask.id);
  if (!verifyExec || verifyExec.status !== "SUCCESS") return "RUNNING";

  if (!isVerificationVerified(mission, verifyExec)) return "RUNNING";

  return "SUCCESS";
}

function hasRetriesRemaining(store: Store, execution: TaskExecution): boolean {
  const task = store.getTask(execution.missionId, execution.taskId);
  if (!task) return false;
  const iterations = store.countHealingIterations(
    execution.missionId,
    execution.taskId,
  );
  return iterations < task.maxRetries;
}

function isVerificationVerified(
  mission: Mission,
  verifyExec: TaskExecution,
): boolean {
  const artifactPath = `artifacts/verification/${mission.id}.json`;
  const artifacts = verifyExec.result?.artifacts ?? [];
  if (!artifacts.includes(artifactPath)) return false;

  // Spike: stub agents embed report metadata in summary for tests without filesystem
  if (verifyExec.result?.summary?.startsWith("VERIFIED:")) {
    try {
      const report = JSON.parse(
        verifyExec.result.summary.slice("VERIFIED:".length),
      );
      const parsed = VerificationReportSchema.safeParse(report);
      return parsed.success && parsed.data.status === "verified";
    } catch {
      return false;
    }
  }

  return verifyExec.result?.status === "COMPLETED";
}

export function missionProgress(store: Store, missionId: string): {
  completed: number;
  total: number;
  percent: number;
} {
  const tasks = store.listTasks(missionId);
  const total = tasks.length;
  const completed = tasks.filter((t) => {
    const latest = store.latestExecution(missionId, t.id);
    return latest?.status === "SUCCESS";
  }).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

export function getUpstreamTaskIds(
  store: Store,
  missionId: string,
  taskId: string,
  kind: "hard" | "soft" = "hard",
): string[] {
  return store
    .listEdges(missionId)
    .filter((e) => e.to === taskId && (kind === "soft" || e.kind === "hard"))
    .map((e) => e.from);
}

export function hardDepsSatisfied(
  store: Store,
  missionId: string,
  task: Task,
): boolean {
  const upstream = getUpstreamTaskIds(store, missionId, task.id, "hard");
  return upstream.every((depId) => {
    const latest = store.latestExecution(missionId, depId);
    return latest?.status === "SUCCESS";
  });
}

export function isEligibleForScheduling(
  store: Store,
  missionId: string,
  task: Task,
  now = Date.now(),
): { eligible: boolean; reason?: string } {
  const latest = store.latestExecution(missionId, task.id);
  if (!latest) return { eligible: false, reason: "no_execution" };
  if (latest.status !== "PENDING" && latest.status !== "WAITING") {
    return { eligible: false, reason: `status_${latest.status}` };
  }

  if (latest.nextEligibleAt) {
    const eligibleAt = Date.parse(latest.nextEligibleAt);
    if (now < eligibleAt) {
      return { eligible: false, reason: "backoff" };
    }
  }

  const edges = store.listEdges(missionId);
  const hardUpstream = edges
    .filter((e) => e.to === task.id && e.kind === "hard")
    .map((e) => e.from);
  const softUpstream = edges
    .filter((e) => e.to === task.id && e.kind === "soft")
    .map((e) => e.from);

  for (const depId of hardUpstream) {
    const depLatest = store.latestExecution(missionId, depId);
    if (depLatest?.status !== "SUCCESS") {
      return { eligible: false, reason: `dep_${depId}_not_success` };
    }
  }

  for (const depId of softUpstream) {
    const depLatest = store.latestExecution(missionId, depId);
    if (depLatest && depLatest.status !== "SUCCESS") {
      return { eligible: false, reason: `soft_dep_${depId}` };
    }
  }

  const running = store
    .listExecutions(missionId)
    .some((e) => e.status === "RUNNING" && e.taskId === task.id);
  if (running) return { eligible: false, reason: "already_running" };

  return { eligible: true };
}
