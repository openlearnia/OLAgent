import type { Database } from "bun:sqlite";
import type {
  AgentResult,
  Mission,
  MissionConstraints,
  MissionStatus,
  Task,
  TaskExecution,
  TaskExecutionStatus,
  WorkflowEdge,
  WorkflowEvent,
} from "../types.ts";
import { newId, nowIso } from "./db.ts";

type TaskRow = {
  id: string;
  mission_id: string;
  kind: string;
  type: string;
  title: string;
  description: string | null;
  assigned_agent_type: string;
  dependencies_json: string;
  acceptance_criteria_json: string;
  parallel_safe: number;
  max_retries: number;
  epic_id: string | null;
  parent_task_id: string | null;
  gate_type: string | null;
  healing_parent_task_id: string | null;
  max_healing_iterations: number | null;
};

type ExecutionRow = {
  id: string;
  task_id: string;
  mission_id: string;
  attempt: number;
  status: string;
  agent_id: string | null;
  acp_session_id: string | null;
  lease_expires_at: string | null;
  next_eligible_at: string | null;
  idempotency_key: string;
  result_json: string | null;
  failure_report_id: string | null;
  started_at: string | null;
  completed_at: string | null;
};

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    missionId: row.mission_id,
    kind: row.kind as Task["kind"],
    type: row.type,
    title: row.title,
    description: row.description ?? undefined,
    assignedAgentType: row.assigned_agent_type,
    dependencies: JSON.parse(row.dependencies_json),
    acceptanceCriteria: JSON.parse(row.acceptance_criteria_json),
    parallelSafe: row.parallel_safe === 1,
    maxRetries: row.max_retries,
    epicId: row.epic_id ?? undefined,
    parentTaskId: row.parent_task_id ?? undefined,
    gateType: (row.gate_type as Task["gateType"]) ?? undefined,
    healingParentTaskId: row.healing_parent_task_id ?? undefined,
    maxHealingIterations: row.max_healing_iterations ?? undefined,
  };
}

function rowToExecution(row: ExecutionRow): TaskExecution {
  return {
    id: row.id,
    taskId: row.task_id,
    missionId: row.mission_id,
    attempt: row.attempt,
    status: row.status as TaskExecutionStatus,
    agentId: row.agent_id ?? undefined,
    acpSessionId: row.acp_session_id ?? undefined,
    leaseExpiresAt: row.lease_expires_at ?? undefined,
    nextEligibleAt: row.next_eligible_at ?? undefined,
    idempotencyKey: row.idempotency_key,
    result: row.result_json ? JSON.parse(row.result_json) : undefined,
    failureReportId: row.failure_report_id ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  };
}

export class Store {
  onEmit?: (event: WorkflowEvent) => void;

  constructor(private db: Database) {}

  insertMission(
    mission: Omit<Mission, "createdAt" | "status"> & {
      status?: MissionStatus;
      createdAt?: string;
    },
  ): Mission {
    const createdAt = mission.createdAt ?? nowIso();
    const status = mission.status ?? "PENDING";
    this.db
      .prepare(
        `INSERT INTO missions (id, goal, constraints_json, status, workspace_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        mission.id,
        mission.goal,
        JSON.stringify(mission.constraints),
        status,
        mission.workspacePath,
        createdAt,
      );
    return {
      id: mission.id,
      goal: mission.goal,
      constraints: mission.constraints,
      status,
      workspacePath: mission.workspacePath,
      createdAt,
    };
  }

  getMission(id: string): Mission | null {
    const row = this.db
      .prepare(`SELECT * FROM missions WHERE id = ?`)
      .get(id) as
      | {
          id: string;
          goal: string;
          constraints_json: string;
          status: string;
          workspace_path: string;
          created_at: string;
          completed_at: string | null;
        }
      | null;
    if (!row) return null;
    return {
      id: row.id,
      goal: row.goal,
      constraints: JSON.parse(row.constraints_json) as MissionConstraints,
      status: row.status as MissionStatus,
      workspacePath: row.workspace_path,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
    };
  }

  updateMissionStatus(
    id: string,
    status: MissionStatus,
    completedAt?: string,
  ): void {
    this.db
      .prepare(
        `UPDATE missions SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?`,
      )
      .run(status, completedAt ?? null, id);
  }

  insertTask(task: Task): void {
    this.db
      .prepare(
        `INSERT INTO tasks (
          id, mission_id, kind, type, title, description, assigned_agent_type,
          dependencies_json, acceptance_criteria_json, parallel_safe, max_retries,
          epic_id, parent_task_id, gate_type, healing_parent_task_id, max_healing_iterations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task.id,
        task.missionId,
        task.kind,
        task.type,
        task.title,
        task.description ?? null,
        task.assignedAgentType,
        JSON.stringify(task.dependencies),
        JSON.stringify(task.acceptanceCriteria),
        task.parallelSafe ? 1 : 0,
        task.maxRetries,
        task.epicId ?? null,
        task.parentTaskId ?? null,
        task.gateType ?? null,
        task.healingParentTaskId ?? null,
        task.maxHealingIterations ?? null,
      );
  }

  getTask(missionId: string, taskId: string): Task | null {
    const row = this.db
      .prepare(`SELECT * FROM tasks WHERE mission_id = ? AND id = ?`)
      .get(missionId, taskId) as TaskRow | null;
    return row ? rowToTask(row) : null;
  }

  listTasks(missionId: string): Task[] {
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE mission_id = ? ORDER BY id`)
      .all(missionId) as TaskRow[];
    return rows.map(rowToTask);
  }

  insertEdge(edge: WorkflowEdge): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO workflow_edges (mission_id, from_task_id, to_task_id, kind)
         VALUES (?, ?, ?, ?)`,
      )
      .run(edge.missionId, edge.from, edge.to, edge.kind);
  }

  listEdges(missionId: string): WorkflowEdge[] {
    const rows = this.db
      .prepare(`SELECT * FROM workflow_edges WHERE mission_id = ?`)
      .all(missionId) as Array<{
      mission_id: string;
      from_task_id: string;
      to_task_id: string;
      kind: string;
    }>;
    return rows.map((r) => ({
      missionId: r.mission_id,
      from: r.from_task_id,
      to: r.to_task_id,
      kind: r.kind as WorkflowEdge["kind"],
    }));
  }

  insertExecution(execution: TaskExecution): void {
    this.db
      .prepare(
        `INSERT INTO task_executions (
          id, task_id, mission_id, attempt, status, agent_id, acp_session_id,
          lease_expires_at, next_eligible_at, idempotency_key, result_json,
          failure_report_id, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        execution.id,
        execution.taskId,
        execution.missionId,
        execution.attempt,
        execution.status,
        execution.agentId ?? null,
        execution.acpSessionId ?? null,
        execution.leaseExpiresAt ?? null,
        execution.nextEligibleAt ?? null,
        execution.idempotencyKey,
        execution.result ? JSON.stringify(execution.result) : null,
        execution.failureReportId ?? null,
        execution.startedAt ?? null,
        execution.completedAt ?? null,
      );
  }

  updateExecution(
    id: string,
    patch: Partial<
      Pick<
        TaskExecution,
        | "status"
        | "agentId"
        | "acpSessionId"
        | "leaseExpiresAt"
        | "nextEligibleAt"
        | "result"
        | "failureReportId"
        | "startedAt"
        | "completedAt"
      >
    >,
  ): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (patch.status !== undefined) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (patch.agentId !== undefined) {
      fields.push("agent_id = ?");
      values.push(patch.agentId);
    }
    if (patch.acpSessionId !== undefined) {
      fields.push("acp_session_id = ?");
      values.push(patch.acpSessionId);
    }
    if (patch.leaseExpiresAt !== undefined) {
      fields.push("lease_expires_at = ?");
      values.push(patch.leaseExpiresAt);
    }
    if (patch.nextEligibleAt !== undefined) {
      fields.push("next_eligible_at = ?");
      values.push(patch.nextEligibleAt);
    }
    if (patch.result !== undefined) {
      fields.push("result_json = ?");
      values.push(JSON.stringify(patch.result));
    }
    if (patch.failureReportId !== undefined) {
      fields.push("failure_report_id = ?");
      values.push(patch.failureReportId);
    }
    if (patch.startedAt !== undefined) {
      fields.push("started_at = ?");
      values.push(patch.startedAt);
    }
    if (patch.completedAt !== undefined) {
      fields.push("completed_at = ?");
      values.push(patch.completedAt);
    }
    if (fields.length === 0) return;
    values.push(id);
    this.db
      .prepare(`UPDATE task_executions SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
  }

  getExecution(id: string): TaskExecution | null {
    const row = this.db
      .prepare(`SELECT * FROM task_executions WHERE id = ?`)
      .get(id) as ExecutionRow | null;
    return row ? rowToExecution(row) : null;
  }

  latestExecution(missionId: string, taskId: string): TaskExecution | null {
    const row = this.db
      .prepare(
        `SELECT * FROM task_executions
         WHERE mission_id = ? AND task_id = ?
         ORDER BY attempt DESC, rowid DESC
         LIMIT 1`,
      )
      .get(missionId, taskId) as ExecutionRow | null;
    return row ? rowToExecution(row) : null;
  }

  listExecutions(missionId: string): TaskExecution[] {
    const rows = this.db
      .prepare(`SELECT * FROM task_executions WHERE mission_id = ?`)
      .all(missionId) as ExecutionRow[];
    return rows.map(rowToExecution);
  }

  countHealingIterations(missionId: string, parentTaskId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM tasks
         WHERE mission_id = ? AND healing_parent_task_id = ? AND type = 'heal-analyze-fix'`,
      )
      .get(missionId, parentTaskId) as { cnt: number } | null;
    return row?.cnt ?? 0;
  }

  emitEvent(event: Omit<WorkflowEvent, "id" | "createdAt">): WorkflowEvent {
    const full: WorkflowEvent = {
      id: newId("evt-"),
      createdAt: nowIso(),
      ...event,
    };
    this.db
      .prepare(
        `INSERT INTO workflow_events (id, type, mission_id, payload_json, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        full.id,
        full.type,
        full.missionId,
        JSON.stringify(full.payload),
        full.idempotencyKey,
        full.createdAt,
      );
    this.onEmit?.(full);
    return full;
  }

  listEvents(missionId: string): WorkflowEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workflow_events WHERE mission_id = ? ORDER BY created_at`,
      )
      .all(missionId) as Array<{
      id: string;
      type: string;
      mission_id: string;
      payload_json: string;
      idempotency_key: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      missionId: r.mission_id,
      payload: JSON.parse(r.payload_json),
      idempotencyKey: r.idempotency_key,
      createdAt: r.created_at,
    }));
  }

  getIdempotencyRecord(key: string): {
    requestHash: string;
    response: unknown;
  } | null {
    const row = this.db
      .prepare(`SELECT request_hash, response_json FROM idempotency_records WHERE key = ?`)
      .get(key) as { request_hash: string; response_json: string } | null;
    if (!row) return null;
    return {
      requestHash: row.request_hash,
      response: JSON.parse(row.response_json),
    };
  }

  saveIdempotencyRecord(
    key: string,
    operation: string,
    requestHash: string,
    response: unknown,
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO idempotency_records (key, operation, request_hash, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(key, operation, requestHash, JSON.stringify(response), nowIso());
  }

  hasHealingDedup(key: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM healing_dedup WHERE key = ?`)
      .get(key);
    return row != null;
  }

  insertHealingDedup(
    key: string,
    missionId: string,
    parentTaskId: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO healing_dedup (key, mission_id, parent_task_id, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(key, missionId, parentTaskId, nowIso());
  }

  listRunningExecutions(): TaskExecution[] {
    const rows = this.db
      .prepare(`SELECT * FROM task_executions WHERE status = 'RUNNING'`)
      .all() as ExecutionRow[];
    return rows.map(rowToExecution);
  }

  failExpiredRunningLeases(nowMs: number): number {
    const nowIso = new Date(nowMs).toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM task_executions
         WHERE status = 'RUNNING'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at < ?`,
      )
      .all(nowIso) as ExecutionRow[];

    let count = 0;
    for (const row of rows) {
      const execution = rowToExecution(row);
      this.updateExecution(execution.id, {
        status: "FAILED",
        completedAt: nowIso,
        result: {
          status: "FAILED",
          artifacts: [],
          commits: [],
          summary: "Lease expired before task completion",
          error: {
            code: "LEASE_EXPIRED",
            message: "Task execution lease expired",
            recoverable: true,
          },
        },
      });
      this.emitEvent({
        type: "task.failed",
        missionId: execution.missionId,
        idempotencyKey: `task.failed:lease:${execution.id}`,
        payload: {
          taskId: execution.taskId,
          taskExecutionId: execution.id,
          reason: "LEASE_EXPIRED",
          message: "Task execution lease expired",
        },
      });
      count++;
    }
    return count;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

export function createPendingExecution(
  taskId: string,
  missionId: string,
  attempt = 1,
): TaskExecution {
  return {
    id: newId("te-"),
    taskId,
    missionId,
    attempt,
    status: "PENDING",
    idempotencyKey: `exec:${taskId}:${attempt}`,
  };
}

export function parseAgentResult(json: string): AgentResult {
  return JSON.parse(json) as AgentResult;
}
