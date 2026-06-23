import type { TaskExecutionStatus } from "../types.ts";
import { engineError } from "../types.ts";

const VALID_TRANSITIONS: Record<
  TaskExecutionStatus,
  Partial<Record<string, TaskExecutionStatus>>
> = {
  PENDING: {
    schedule: "RUNNING",
    soft_dep_unmet: "WAITING",
  },
  WAITING: {
    deps_satisfied: "PENDING",
  },
  RUNNING: {
    complete_success: "SUCCESS",
    complete_failed_non_recoverable: "BLOCKED",
    complete_failed_recoverable: "FAILED",
    lease_expired: "FAILED",
  },
  FAILED: {
    healing_scheduled: "PENDING",
    healing_retest_pass: "SUCCESS",
    retries_exhausted_blocked: "BLOCKED",
    retries_exhausted_failed: "FAILED",
  },
  SUCCESS: {},
  BLOCKED: {
    admin_reset: "PENDING",
  },
};

export type TransitionEvent =
  | "schedule"
  | "soft_dep_unmet"
  | "deps_satisfied"
  | "complete_success"
  | "complete_failed_non_recoverable"
  | "complete_failed_recoverable"
  | "lease_expired"
  | "healing_scheduled"
  | "healing_retest_pass"
  | "retries_exhausted_blocked"
  | "retries_exhausted_failed"
  | "admin_reset";

export function assertTransition(
  from: TaskExecutionStatus,
  event: TransitionEvent,
): TaskExecutionStatus {
  const next = VALID_TRANSITIONS[from][event];
  if (!next) {
    throw engineError(
      "INVALID_TRANSITION",
      `Cannot transition from ${from} via ${event}`,
    );
  }
  return next;
}

export function canTransition(
  from: TaskExecutionStatus,
  event: TransitionEvent,
): boolean {
  return VALID_TRANSITIONS[from][event] != null;
}

export function isTerminal(status: TaskExecutionStatus): boolean {
  return status === "SUCCESS" || status === "BLOCKED";
}
