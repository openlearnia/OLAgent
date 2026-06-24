import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
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
import { resolveTaskBackend } from "./backend.ts";
import { mapAcpSessionToAgentResult } from "./acp-result.ts";
import { spawnCursorAcpSession } from "./spawn-acp.ts";

export interface AgentRuntimeCallerOptions {
  engineUrl?: string;
  jwtSecret: string;
  dryRun?: boolean;
  mcpEndpoint?: string;
  /** Test override for Cursor agent binary (default: `ASF_CURSOR_AGENT_BIN` or `agent`). */
  acpAgentBin?: string;
  acpAgentArgs?: string[];
  acpOptions?: import("@olagent/acp-client").RunCursorAcpSessionOptions;
}

interface ActiveChild {
  proc: Subprocess;
  taskExecutionId: string;
}

/**
 * Subprocess Agent Runtime Caller — routes tasks by backend resolver on `task.scheduled`.
 *
 * - **cursor-acp** (M5b): `agent acp` via `@olagent/acp-client`; caller POSTs completeTask.
 * - **custom-llm** (M3 fallback): live `asf agent run` for pilot types; agent POSTs completeTask.
 * - **dry-run** (M2): `asf agent run --dry-run`; caller POSTs completeTask from bundle result.
 */
export function wireAgentRuntimeCaller(
  engine: WorkflowEngine,
  options: AgentRuntimeCallerOptions,
): () => void {
  const engineUrl =
    options.engineUrl ??
    process.env.ASF_ENGINE_URL ??
    `http://127.0.0.1:${process.env.PORT ?? 3100}`;
  const globalDryRun =
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

  const completeFromResult = (
    taskExecutionId: string,
    agentId: string | undefined,
    result: AgentResult,
    keyPrefix: string,
  ) => {
    const idempotencyKey = `${keyPrefix}:${taskExecutionId}:${hashPayload(result)}`;
    engine.completeTask(taskExecutionId, {
      idempotencyKey,
      agentId,
      result,
    });
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

      const route = resolveTaskBackend(task.assignedAgentType, {
        dryRun: globalDryRun,
      });

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

        if (route.backend === "cursor-acp" && !route.dryRun) {
          await mkdir(bundle.context.workspace, { recursive: true });

          const session = await spawnCursorAcpSession(bundle, {
            engineUrl,
            executionToken: token,
            agentBin: options.acpAgentBin,
            agentArgs: options.acpAgentArgs,
            acpOptions: options.acpOptions,
          });

          const stillRunning = store.getExecution(execution.id);
          if (!stillRunning || stillRunning.status !== "RUNNING") {
            return;
          }

          const result = mapAcpSessionToAgentResult(session);
          completeFromResult(
            execution.id,
            execution.agentId,
            result,
            "acp-session",
          );
          return;
        }

        const taskDryRun = route.dryRun;
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
            completeFromResult(
              execution.id,
              execution.agentId,
              result,
              "agent-run",
            );
          }
          // Live custom-llm: agent already POSTed completeTask — caller does not double-complete
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
          completeFromResult(
            execution.id,
            execution.agentId,
            failureResult,
            `agent-run-fail:${exitCode}`,
          );
        }
      } catch (error) {
        console.error(
          `[agent-caller] failed for ${item.taskExecutionId}:`,
          error,
        );
        const stillRunning = store.getExecution(item.taskExecutionId);
        if (stillRunning?.status === "RUNNING") {
          try {
            completeFromResult(
              item.taskExecutionId,
              stillRunning.agentId,
              {
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
              "agent-run-error",
            );
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
