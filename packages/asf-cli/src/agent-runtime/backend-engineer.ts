import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ContextBundle } from "@olagent/workflow-engine";
import type { FetchFn } from "./heartbeat.ts";
import type { LlmConfig } from "./llm-config.ts";
import { generateBackendCode } from "./llm/generate.ts";
import {
  assembleBackendEngineerResult,
  assembleFailureResult,
} from "./result.ts";
import { startHeartbeatLoop } from "./heartbeat.ts";
import { postCompleteTask } from "./complete.ts";
import { enterWorkspaceSandbox } from "./sandbox.ts";

export interface RunBackendEngineerOptions {
  bundle: ContextBundle;
  config: LlmConfig;
  fetchFn?: FetchFn;
}

/**
 * Minimal LLM pilot loop for backend-engineer: generate code, write file, completeTask.
 */
export async function runBackendEngineerPilot(
  options: RunBackendEngineerOptions,
): Promise<number> {
  const { bundle, config } = options;
  const startedAt = Date.now();
  let sandbox: ReturnType<typeof enterWorkspaceSandbox> | undefined;
  let heartbeat: ReturnType<typeof startHeartbeatLoop> | undefined;
  let leaseLost = false;

  const fail = async (code: string, message: string, recoverable: boolean) => {
    const result = assembleFailureResult(code, message, recoverable, startedAt);
    await postCompleteTask({
      engineUrl: bundle.engineUrl,
      taskExecutionId: bundle.taskExecutionId,
      agentId: bundle.agentId,
      executionToken: bundle.executionToken,
      result,
      fetchFn: options.fetchFn,
    });
    return recoverable ? 3 : 3;
  };

  try {
    sandbox = enterWorkspaceSandbox(bundle.context.workspace);
    heartbeat = startHeartbeatLoop({
      engineUrl: bundle.engineUrl,
      taskExecutionId: bundle.taskExecutionId,
      executionToken: bundle.executionToken,
      fetchFn: options.fetchFn,
      onLeaseLost: () => {
        leaseLost = true;
      },
    });

    const generation = await generateBackendCode({
      context: bundle.context,
      config,
      fetchFn: options.fetchFn,
    });

    if (leaseLost) {
      return 4;
    }

    const relativePath = generation.filePath.replace(/^\.\//, "");
    const absolutePath = path.join(bundle.context.workspace, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await Bun.write(absolutePath, generation.content);

    const exists = await Bun.file(absolutePath).exists();
    if (!exists) {
      return fail("ARTIFACT_MISSING", `Output file not found: ${relativePath}`, false);
    }

    const result = assembleBackendEngineerResult(
      bundle.context,
      [relativePath],
      startedAt,
      generation.tokenUsage,
      generation.summary,
    );

    const complete = await postCompleteTask({
      engineUrl: bundle.engineUrl,
      taskExecutionId: bundle.taskExecutionId,
      agentId: bundle.agentId,
      executionToken: bundle.executionToken,
      result,
      fetchFn: options.fetchFn,
    });

    if (!complete.ok) {
      console.error(
        `completeTask failed (${complete.status}): ${complete.message}`,
      );
      return 2;
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("backend-engineer pilot failed:", message);
    try {
      return await fail("AGENT_ERROR", message, true);
    } catch {
      return 2;
    }
  } finally {
    heartbeat?.stop();
    sandbox?.restore();
  }
}
