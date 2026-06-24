import { readFile } from "node:fs/promises";
import type { Subprocess } from "bun";
import type { WorkflowEngine } from "../engine/engine.ts";
import { hashPayload } from "../engine/db.ts";
import type { AgentResult, WorkflowEvent } from "../types.ts";
import {
  buildContextBundle,
  loadMissionContractVersions,
  validateContextBundle,
  writeContextBundle,
} from "./bundle.ts";
import { buildAgentRunArgv } from "./resolve-binary.ts";
import { mintExecutionToken } from "./token.ts";
import { validateAgentResult } from "../schemas/validators.ts";

function resolvePilotAgentTypes(): Set<string> {
  const raw = process.env.ASF_LLM_AGENT_TYPES ?? "backend-engineer";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function shouldSpawnLive(agentType: string, globalDryRun: boolean): boolean {
  if (globalDryRun) return false;
  return resolvePilotAgentTypes().has(agentType);
}

export interface AgentRuntimeCallerOptions {
  engineUrl?: string;
  jwtSecret: string;
  dryRun?: boolean;
  mcpEndpoint?: string;
}

interface ActiveChild {
  proc: Subprocess;
  taskExecutionId: string;
}

/**
 * Subprocess Agent Runtime Caller — spawns `asf agent run` on `task.scheduled`.
 * M2: dry-run by default (`ASF_AGENT_RUN_DRY_RUN` !== "0"); caller POSTs completeTask.
 * M3: pilot types (`ASF_LLM_AGENT_TYPES`, default backend-engineer) spawn live;
 *     agent POSTs completeTask on success; caller only completes on dry-run or failure.
 */
export function wireAgentRuntimeCaller(
  engine: WorkflowEngine,
  options: AgentRuntimeCallerOptions,
): () => void {
  const engineUrl =
    options.engineUrl ??
    process.env.ASF_ENGINE_URL ??
    `http://127.0.0.1:${process.env.PORT ?? 3100}`;
  const dryRun =
    options.dryRun ??
    (process.env.ASF_AGENT_RUN_DRY_RUN !== "0");
  const mcpEndpoint =
    options.mcpEndpoint ??
    process.env.ASF_MCP_ENDPOINT ??
    `http://127.0.0.1:${process.env.ASF_MCP_PORT ?? "3101"}/mcp`;
  const activeChildren = new Map<string, ActiveChild>();

  const killAll = () => {
    for (const child of activeChildren.values()) {
      try {
        child.proc.kill();
      } catch {
        // already exited
      }
    }
    activeChildren.clear();
  };

  const handleScheduled = async (event: WorkflowEvent) => {
    const payload = event.payload as {
      tasks?: Array<{
        taskId: string;
        taskExecutionId: string;
        agentType: string;
      }>;
    };
    const items = payload.tasks ?? [];

    const work = items.map(async (item) => {
      if (item.agentType === "gate-runner") return;

      const store = engine.getStore();
      const execution = store.getExecution(item.taskExecutionId);
      if (!execution || execution.status !== "RUNNING") return;

      const task = store.getTask(event.missionId, item.taskId);
      if (!task || task.kind === "gate") return;

      const mission = store.getMission(event.missionId);
      if (!mission) return;

      try {
        const contractVersions = await loadMissionContractVersions(
          mission.workspacePath,
        );
        const contractVersion =
          contractVersions[task.assignedAgentType] ?? undefined;

        const token = await mintExecutionToken(
          options.jwtSecret,
          {
            taskExecutionId: execution.id,
            agentId: execution.agentId ?? "",
          },
          3_600_000,
        );

        const bundle = buildContextBundle({
          mission,
          task,
          execution,
          engineUrl,
          executionToken: token,
          contractVersion,
          mcpEndpoint,
        });

        const bundlePath = await writeContextBundle(bundle);
        const taskDryRun = !shouldSpawnLive(task.assignedAgentType, dryRun);
        const argv = buildAgentRunArgv(bundlePath, { dryRun: taskDryRun });

        const proc = Bun.spawn({
          cmd: argv,
          env: {
            ...process.env,
            ASF_ENGINE_URL: engineUrl,
            ASF_INTERNAL_JWT_SECRET: options.jwtSecret,
            ...(taskDryRun ? {} : { ASF_AGENT_RUN_DRY_RUN: "0" }),
          },
          stdout: "pipe",
          stderr: "pipe",
        });

        activeChildren.set(execution.id, { proc, taskExecutionId: execution.id });

        const timeoutHandle = setTimeout(() => {
          try {
            proc.kill("SIGTERM");
            setTimeout(() => {
              try {
                proc.kill("SIGKILL");
              } catch {
                // ignore
              }
            }, 10_000);
          } catch {
            // ignore
          }
        }, bundle.timeoutMs);

        const exitCode = await proc.exited;
        clearTimeout(timeoutHandle);
        activeChildren.delete(execution.id);

        const stillRunning = store.getExecution(execution.id);
        if (!stillRunning || stillRunning.status !== "RUNNING") {
          return;
        }

        if (exitCode === 0) {
          if (taskDryRun) {
            const resultRaw = await readFile(bundle.resultPath, "utf8");
            const result = validateAgentResult(JSON.parse(resultRaw));
            const idempotencyKey = `agent-run:${execution.id}:${hashPayload(result)}`;
            engine.completeTask(execution.id, {
              idempotencyKey,
              agentId: execution.agentId,
              result,
            });
          }
          // Live pilot: agent already POSTed completeTask — caller does not double-complete
        } else {
          const failureResult: AgentResult = {
            status: "FAILED",
            artifacts: [],
            commits: [],
            summary: `Agent subprocess exited with code ${exitCode}`,
            error: {
              code: exitCode === 4 ? "LEASE_EXPIRED" : "AGENT_SUBPROCESS_FAILED",
              message: `asf agent run exited ${exitCode}`,
              recoverable: exitCode !== 1,
            },
          };
          engine.completeTask(execution.id, {
            idempotencyKey: `agent-run-fail:${execution.id}:${exitCode}`,
            agentId: execution.agentId,
            result: failureResult,
          });
        }
      } catch (error) {
        console.error(
          `[agent-caller] failed for ${item.taskExecutionId}:`,
          error,
        );
        const stillRunning = store.getExecution(item.taskExecutionId);
        if (stillRunning?.status === "RUNNING") {
          try {
            engine.completeTask(item.taskExecutionId, {
              idempotencyKey: `agent-run-error:${item.taskExecutionId}`,
              agentId: stillRunning.agentId,
              result: {
                status: "FAILED",
                artifacts: [],
                commits: [],
                summary: "Agent runtime caller error",
                error: {
                  code: "CALLER_ERROR",
                  message: error instanceof Error ? error.message : String(error),
                  recoverable: true,
                },
              },
            });
          } catch {
            // execution may have transitioned
          }
        }
      }
    });

    await Promise.all(work);
  };

  const unsubscribe = engine.getEventBus().subscribe((event) => {
    if (event.type !== "task.scheduled") return;
    void handleScheduled(event);
  });

  return () => {
    unsubscribe();
    killAll();
  };
}

export async function loadAndValidateBundle(
  bundlePath: string,
): Promise<ReturnType<typeof validateContextBundle>> {
  const raw = await Bun.file(bundlePath).json();
  return validateContextBundle(raw);
}
