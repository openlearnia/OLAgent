export type TaskExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING"
  | "BLOCKED"
  | "FAILED"
  | "SUCCESS";

export type MissionStatus =
  | "PENDING"
  | "RUNNING"
  | "BLOCKED"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";

export type NodeKind = "task" | "gate" | "healing-child";
export type EdgeKind = "hard" | "soft";
export type GateType = "merge" | "test" | "deploy" | "verify";

export interface MissionConstraints {
  stack?: string[];
  deployment?: string;
  database?: string;
  auth?: string;
  environment?: string;
  maxRetries?: number;
  retryBackoffMs?: number[];
  verification?: {
    requireAuth?: boolean;
    primaryResource?: string;
    healthPath?: string;
    allowedHosts?: string[];
  };
  [key: string]: unknown;
}

export interface Mission {
  id: string;
  goal: string;
  constraints: MissionConstraints;
  status: MissionStatus;
  workspacePath: string;
  createdAt: string;
  completedAt?: string;
}

export interface Task {
  id: string;
  missionId: string;
  kind: NodeKind;
  type: string;
  title: string;
  description?: string;
  assignedAgentType: string;
  dependencies: string[];
  acceptanceCriteria: string[];
  parallelSafe: boolean;
  maxRetries: number;
  epicId?: string;
  parentTaskId?: string;
  gateType?: GateType;
  healingParentTaskId?: string;
  maxHealingIterations?: number;
}

export interface AgentResult {
  status: "COMPLETED" | "FAILED";
  artifacts: string[];
  commits: string[];
  summary: string;
  needsHealing?: boolean;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
    classification?: string;
  };
  metrics?: {
    tokenUsage: { input: number; output: number };
    durationMs: number;
  };
}

export interface TaskExecution {
  id: string;
  taskId: string;
  missionId: string;
  attempt: number;
  status: TaskExecutionStatus;
  agentId?: string;
  acpSessionId?: string;
  leaseExpiresAt?: string;
  nextEligibleAt?: string;
  idempotencyKey: string;
  result?: AgentResult;
  failureReportId?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowEdge {
  missionId: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface WorkflowEvent {
  id: string;
  type: string;
  missionId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
}

export interface CompleteTaskRequest {
  idempotencyKey: string;
  agentId?: string;
  result: AgentResult;
}

export interface CompleteTaskResponse {
  taskExecutionId: string;
  newStatus: TaskExecutionStatus;
  duplicate: boolean;
  continuation: {
    scheduledTasks: string[];
    missionStatus: MissionStatus;
  };
}

export interface ScheduleTasksRequest {
  missionId: string;
  trigger: string;
  triggerEventId: string;
  idempotencyKey: string;
  force?: boolean;
}

export interface ScheduleTasksResponse {
  scheduled: Array<{
    taskId: string;
    taskExecutionId: string;
    agentType: string;
  }>;
  eligibleButDeferred: Array<{ taskId: string; reason: string }>;
  missionStatus: MissionStatus;
}

export interface SeedNode {
  id: string;
  kind: NodeKind;
  type: string;
  assignedAgentType: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  parallelSafe?: boolean;
  maxRetries?: number;
  parentTaskId?: string;
  gateType?: GateType;
  maxHealingIterations?: number;
}

export interface SeedEdge {
  from: string;
  to: string;
  kind?: EdgeKind;
}

export interface EngineError extends Error {
  code: string;
}

export function engineError(code: string, message: string): EngineError {
  const err = new Error(message) as EngineError;
  err.code = code;
  return err;
}

export const BOOTSTRAP_TASK_TYPES = [
  "discover-requirements",
  "research",
  "architecture",
  "plan-tasks",
] as const;

export const IMPLEMENTATION_TASK_TYPES = [
  "setup-repo",
  "schema-migration",
  "implement-backend",
  "implement-frontend",
  "implement-infra",
  "write-tests",
  "browser-test",
  "deploy",
  "verify-deployment",
] as const;

export const HEALING_TASK_TYPES = ["heal-analyze-fix", "heal-retest"] as const;
