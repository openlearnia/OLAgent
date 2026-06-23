import type { Database } from "bun:sqlite";
import type {
  CompleteTaskRequest,
  CompleteTaskResponse,
  Mission,
  MissionConstraints,
  ScheduleTasksRequest,
  ScheduleTasksResponse,
  SeedEdge,
  SeedNode,
  Task,
  TaskExecutionStatus,
} from "../types.ts";
import { engineError } from "../types.ts";
import { validateAgentResult } from "../schemas/validators.ts";
import { createDatabase, hashPayload, newId, nowIso } from "./db.ts";
import {
  deriveMissionStatus,
  isEligibleForScheduling,
  missionProgress,
} from "./mission-status.ts";
import { mergePlanIntoDag } from "./planner-merge.ts";
import {
  runGateForTask,
  handleHealingRetestComplete,
  healingDedupKey,
  materializeHealingChildren,
  newFailureReportId,
} from "./healing.ts";
import { assertTransition } from "./state-machine.ts";
import { WorkflowEventBus } from "./events.ts";
import {
  CRM_CONSTRAINTS,
  CRM_HEALING_TEMPLATES,
  CRM_SEED_EDGES,
  CRM_SEED_NODES,
} from "../fixtures/crm-seed.ts";
import { provisionMissionWorkspace } from "../mission/workspace.ts";
import { MissionCreateInputSchema } from "../schemas/validators.ts";
import { Store, createPendingExecution } from "./store.ts";

const LEASE_SECONDS = 120;

export interface WorkflowEngineOptions {
  db?: Database;
  dbPath?: string;
  now?: () => number;
  eventBus?: WorkflowEventBus;
}

export class WorkflowEngine {
  private store: Store;
  private now: () => number;
  readonly eventBus: WorkflowEventBus;

  constructor(options: WorkflowEngineOptions = {}) {
    const db =
      options.db ?? createDatabase(options.dbPath ?? ":memory:");
    this.store = new Store(db);
    this.eventBus = options.eventBus ?? new WorkflowEventBus();
    this.store.onEmit = (event) => this.eventBus.emit(event);
    this.now = options.now ?? (() => Date.now());
  }

  getStore(): Store {
    return this.store;
  }

  getNow(): number {
    return this.now();
  }

  getEventBus(): WorkflowEventBus {
    return this.eventBus;
  }


  async createMissionFromDocument(
    input: unknown,
    options?: { workspacesRoot?: string },
  ): Promise<Mission> {
    const parsed = MissionCreateInputSchema.parse(input);
    const requestHash = hashPayload(parsed);

    if (parsed.idempotencyKey) {
      const existing = this.store.getIdempotencyRecord(parsed.idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw engineError(
            "IDEMPOTENCY_CONFLICT",
            "Same idempotency key with different payload",
          );
        }
        const prior = existing.response as { mission: Mission };
        return prior.mission;
      }
    }

    const missionId = parsed.id ?? newId("m-");
    if (parsed.id && this.store.getMission(parsed.id)) {
      throw engineError("MISSION_ALREADY_EXISTS", parsed.id);
    }
    const constraints = {
      ...CRM_CONSTRAINTS,
      ...(parsed.constraints ?? {}),
    } as MissionConstraints;

    const missionDocument = {
      id: missionId,
      goal: parsed.goal,
      constraints,
      ...(parsed.contractVersions
        ? { contractVersions: parsed.contractVersions }
        : {}),
      ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
    };

    const workspacePath = await provisionMissionWorkspace({
      missionId,
      missionDocument,
      workspacesRoot: options?.workspacesRoot,
    });

    const mission = this.createMission({
      id: missionId,
      goal: parsed.goal,
      constraints,
      workspacePath,
      seedNodes: CRM_SEED_NODES,
      seedEdges: CRM_SEED_EDGES,
      healingTemplates: CRM_HEALING_TEMPLATES,
    });

    if (parsed.idempotencyKey) {
      this.store.saveIdempotencyRecord(
        parsed.idempotencyKey,
        "createMission",
        requestHash,
        { mission },
      );
    }

    return mission;
  }

  createMission(input: {
    id?: string;
    goal: string;
    constraints?: MissionConstraints;
    workspacePath?: string;
    seedNodes: SeedNode[];
    seedEdges: SeedEdge[];
    healingTemplates?: Array<{
      parentTaskId: string;
      maxIterations?: number;
    }>;
  }): Mission {
    const missionId = input.id ?? newId("m-");
    const mission = this.store.insertMission({
      id: missionId,
      goal: input.goal,
      constraints: input.constraints ?? {},
      workspacePath: input.workspacePath ?? `workspaces/${missionId}`,
      status: "PENDING",
    });

    for (const node of input.seedNodes) {
      const task: Task = {
        id: node.id,
        missionId,
        kind: node.kind,
        type: node.type,
        title: node.title,
        description: node.description,
        assignedAgentType: node.assignedAgentType,
        dependencies: [],
        acceptanceCriteria: node.acceptanceCriteria ?? [],
        parallelSafe: node.parallelSafe ?? false,
        maxRetries: node.maxRetries ?? 3,
        parentTaskId: node.parentTaskId,
        gateType: node.gateType,
        maxHealingIterations: node.maxHealingIterations,
      };
      this.store.insertTask(task);
      this.store.insertExecution(createPendingExecution(task.id, missionId));
    }

    for (const edge of input.seedEdges) {
      this.store.insertEdge({
        missionId,
        from: edge.from,
        to: edge.to,
        kind: edge.kind ?? "hard",
      });
    }

    for (const tmpl of input.healingTemplates ?? []) {
      const healingId = `healing-${tmpl.parentTaskId}`;
      this.store.insertTask({
        id: healingId,
        missionId,
        kind: "healing-child",
        type: "healing-child",
        title: `Healing template for ${tmpl.parentTaskId}`,
        assignedAgentType: "system",
        dependencies: [],
        acceptanceCriteria: [],
        parallelSafe: false,
        maxRetries: tmpl.maxIterations ?? 3,
        parentTaskId: tmpl.parentTaskId,
        maxHealingIterations: tmpl.maxIterations ?? 3,
      });
    }

    this.store.emitEvent({
      type: "mission.created",
      missionId,
      idempotencyKey: `mission.created:${missionId}`,
      payload: {
        missionId,
        goal: input.goal,
        constraints: input.constraints ?? {},
      },
    });

    return mission;
  }

  startMission(missionId: string): ScheduleTasksResponse {
    const mission = this.store.getMission(missionId);
    if (!mission) throw engineError("MISSION_NOT_FOUND", missionId);

    this.store.updateMissionStatus(missionId, "RUNNING");
    this.store.emitEvent({
      type: "mission.started",
      missionId,
      idempotencyKey: `mission.started:${missionId}`,
      payload: {
        missionId,
        seedTasks: this.store
          .listTasks(missionId)
          .filter((t) => t.kind === "task")
          .map((t) => t.id),
      },
    });

    return this.scheduleTasks({
      missionId,
      trigger: "mission.started",
      triggerEventId: `mission.started:${missionId}`,
      idempotencyKey: `schedule:${missionId}:mission.started:${missionId}`,
    });
  }

  completeTask(
    taskExecutionId: string,
    request: CompleteTaskRequest,
  ): CompleteTaskResponse {
    const requestHash = hashPayload(request);
    const existing = this.store.getIdempotencyRecord(request.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw engineError(
          "IDEMPOTENCY_CONFLICT",
          "Same idempotency key with different payload",
        );
      }
      const prior = existing.response as CompleteTaskResponse;
      return { ...prior, duplicate: true };
    }

    const result = validateAgentResult(request.result);
    const execution = this.store.getExecution(taskExecutionId);
    if (!execution) {
      throw engineError("EXECUTION_NOT_FOUND", taskExecutionId);
    }
    if (execution.status !== "RUNNING") {
      throw engineError(
        "INVALID_TRANSITION",
        `Cannot complete execution in status ${execution.status}`,
      );
    }

    const task = this.store.getTask(execution.missionId, execution.taskId);
    if (!task) throw engineError("TASK_NOT_FOUND", execution.taskId);

    const missionId = execution.missionId;
    let newStatus: TaskExecutionStatus = execution.status;
    const triggerEventId = newId("evt-");

    const needsHealing =
      result.needsHealing === true ||
      (result.status === "FAILED" && result.error?.recoverable === true);

    if (result.status === "COMPLETED" && !needsHealing) {
      newStatus = assertTransition(execution.status, "complete_success");
      this.store.updateExecution(taskExecutionId, {
        status: newStatus,
        result,
        completedAt: nowIso(),
      });

      if (task.type === "heal-retest" && task.healingParentTaskId) {
        handleHealingRetestComplete(this.store, missionId, task.id, true);
      }

      if (task.type === "plan-tasks" && result.summary.startsWith("PLAN:")) {
        const planJson = JSON.parse(result.summary.slice("PLAN:".length));
        const merge = mergePlanIntoDag(this.store, missionId, planJson);
        this.store.emitEvent({
          type: "mission.progress",
          missionId,
          idempotencyKey: `mission.progress:plan-merge:${triggerEventId}`,
          payload: {
            mergedTasks: merge.mergedTaskIds.length,
            gates: merge.gateIds.length,
          },
        });
      }

      this.store.emitEvent({
        type: "task.completed",
        missionId,
        idempotencyKey: `task.completed:${taskExecutionId}:${request.idempotencyKey}`,
        payload: {
          taskId: task.id,
          taskExecutionId,
          status: newStatus,
          artifacts: result.artifacts,
          commits: result.commits,
          summary: result.summary,
        },
      });
    } else if (needsHealing) {
      newStatus = assertTransition(
        execution.status,
        "complete_failed_recoverable",
      );
      const failureReportId = newFailureReportId();
      this.store.updateExecution(taskExecutionId, {
        status: newStatus,
        result,
        failureReportId,
        completedAt: nowIso(),
      });

      const dedupKey = healingDedupKey(taskExecutionId, failureReportId);
      if (!this.store.hasHealingDedup(dedupKey)) {
        this.store.insertHealingDedup(dedupKey, missionId, task.id);
        materializeHealingChildren(
          this.store,
          missionId,
          task.id,
          1,
          task.maxRetries,
        );
      }

      this.store.emitEvent({
        type: "task.failed",
        missionId,
        idempotencyKey: `task.failed:${taskExecutionId}`,
        payload: {
          taskId: task.id,
          taskExecutionId,
          failureReportId,
          classification: result.error?.classification ?? "unknown",
          recoverable: true,
          retryCount: 1,
          maxRetries: task.maxRetries,
        },
      });
      this.store.emitEvent({
        type: "failure.detected",
        missionId,
        idempotencyKey: `failure.detected:${failureReportId}`,
        payload: {
          taskId: task.id,
          taskExecutionId,
          domain: "test",
          classification: result.error?.classification,
          message: result.error?.message,
          recoverable: true,
          reportPath: `artifacts/failure-reports/${task.id}.json`,
        },
      });
    } else if (result.status === "FAILED") {
      const recoverable = result.error?.recoverable === true;
      const event = recoverable
        ? "complete_failed_recoverable"
        : "complete_failed_non_recoverable";
      newStatus = assertTransition(execution.status, event);
      this.store.updateExecution(taskExecutionId, {
        status: newStatus,
        result,
        completedAt: nowIso(),
      });

      if (task.type === "heal-retest" && task.healingParentTaskId) {
        handleHealingRetestComplete(this.store, missionId, task.id, false);
      }

      this.store.emitEvent({
        type: recoverable ? "task.failed" : "task.blocked",
        missionId,
        idempotencyKey: `task.terminal:${taskExecutionId}`,
        payload: {
          taskId: task.id,
          taskExecutionId,
          reason: result.error?.code,
          message: result.error?.message,
        },
      });
    }

    const scheduleResponse = this.scheduleTasks({
      missionId,
      trigger: "task.completed",
      triggerEventId,
      idempotencyKey: `schedule:${missionId}:${triggerEventId}`,
    });

    const missionStatus = this.refreshMissionStatus(missionId);
    const response: CompleteTaskResponse = {
      taskExecutionId,
      newStatus,
      duplicate: false,
      continuation: {
        scheduledTasks: scheduleResponse.scheduled.map((s) => s.taskId),
        missionStatus,
      },
    };

    this.store.saveIdempotencyRecord(
      request.idempotencyKey,
      "completeTask",
      requestHash,
      response,
    );

    return response;
  }

  scheduleTasks(request: ScheduleTasksRequest): ScheduleTasksResponse {
    const requestHash = hashPayload(request);
    const existing = this.store.getIdempotencyRecord(request.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw engineError("IDEMPOTENCY_CONFLICT", "Schedule idempotency conflict");
      }
      return existing.response as ScheduleTasksResponse;
    }

    const mission = this.store.getMission(request.missionId);
    if (!mission) throw engineError("MISSION_NOT_FOUND", request.missionId);

    const scheduled: ScheduleTasksResponse["scheduled"] = [];
    const deferred: ScheduleTasksResponse["eligibleButDeferred"] = [];
    const now = this.now();
    let progressed = true;

    while (progressed) {
      progressed = false;
      this.promoteWaitingTasks(request.missionId);

      const tasks = this.store.listTasks(request.missionId);
      const eligibleTasks = tasks.filter((t) => {
        if (t.kind === "healing-child") return false;
        const { eligible, reason } = isEligibleForScheduling(
          this.store,
          request.missionId,
          t,
          now,
        );
        if (!eligible && reason && reason !== "status_RUNNING") {
          if (
            (reason.startsWith("dep_") || reason === "backoff") &&
            !deferred.some((d) => d.taskId === t.id)
          ) {
            deferred.push({ taskId: t.id, reason });
          }
        }
        return eligible;
      });

      const serialized = applySharedSurfaceSerialization(eligibleTasks);

      for (const task of serialized) {
        const latest = this.store.latestExecution(request.missionId, task.id);
        if (!latest || latest.status !== "PENDING") continue;

        const next = assertTransition(latest.status, "schedule");
        const leaseExpiresAt = new Date(
          now + LEASE_SECONDS * 1000,
        ).toISOString();

        this.store.updateExecution(latest.id, {
          status: next,
          startedAt: nowIso(),
          leaseExpiresAt,
          agentId: task.kind === "gate" ? "gate-runner" : newId("a-"),
        });

        if (task.kind === "gate") {
          runGateForTask(this.store, request.missionId, task, latest.id);
          scheduled.push({
            taskId: task.id,
            taskExecutionId: latest.id,
            agentType: "gate-runner",
          });
          progressed = true;
          continue;
        }

        scheduled.push({
          taskId: task.id,
          taskExecutionId: latest.id,
          agentType: task.assignedAgentType,
        });
        progressed = true;
      }
    }

    if (scheduled.length > 0) {
      this.store.emitEvent({
        type: "task.scheduled",
        missionId: request.missionId,
        idempotencyKey: request.idempotencyKey,
        payload: {
          missionId: request.missionId,
          tasks: scheduled,
          reason: request.trigger,
        },
      });
    }

    const progress = missionProgress(this.store, request.missionId);
    this.store.emitEvent({
      type: "mission.progress",
      missionId: request.missionId,
      idempotencyKey: `mission.progress:${request.idempotencyKey}`,
      payload: progress,
    });

    const missionStatus = this.refreshMissionStatus(request.missionId);
    const response: ScheduleTasksResponse = {
      scheduled,
      eligibleButDeferred: deferred,
      missionStatus,
    };

    this.store.saveIdempotencyRecord(
      request.idempotencyKey,
      "scheduleTasks",
      requestHash,
      response,
    );

    return response;
  }

  heartbeat(taskExecutionId: string, extendBySeconds = 120): void {
    const execution = this.store.getExecution(taskExecutionId);
    if (!execution || execution.status !== "RUNNING") return;
    const leaseExpiresAt = new Date(
      this.now() + extendBySeconds * 1000,
    ).toISOString();
    this.store.updateExecution(taskExecutionId, { leaseExpiresAt });
  }

  private promoteWaitingTasks(missionId: string): void {
    const tasks = this.store.listTasks(missionId);
    for (const task of tasks) {
      const latest = this.store.latestExecution(missionId, task.id);
      if (!latest || latest.status !== "WAITING") continue;
      const { eligible } = isEligibleForScheduling(
        this.store,
        missionId,
        task,
        this.now(),
      );
      if (eligible) {
        const next = assertTransition(latest.status, "deps_satisfied");
        this.store.updateExecution(latest.id, { status: next });
      }
    }
  }

  private refreshMissionStatus(missionId: string) {
    const mission = this.store.getMission(missionId);
    if (!mission) return "FAILED" as const;
    const previousStatus = mission.status;
    const status = deriveMissionStatus(this.store, mission);
    const completedAt = status === "SUCCESS" ? nowIso() : undefined;
    this.store.updateMissionStatus(missionId, status, completedAt);

    if (status === "SUCCESS" && previousStatus !== "SUCCESS") {
      this.store.emitEvent({
        type: "mission.completed",
        missionId,
        idempotencyKey: `mission.completed:${missionId}`,
        payload: {
          missionId,
          status,
          verificationReportPath: `artifacts/verification/${missionId}.json`,
        },
      });
    }

    return status;
  }
}

function applySharedSurfaceSerialization(tasks: Task[]): Task[] {
  const nonParallel = tasks.filter((t) => !t.parallelSafe);
  if (nonParallel.length <= 1) return tasks;
  return [nonParallel[0]!];
}
