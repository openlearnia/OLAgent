import { writeFile } from "node:fs/promises";
import {
  StubAgentRuntime,
  validateContextBundle,
} from "@olagent/workflow-engine";
import type { CliConfig } from "../../config.ts";
import { logDebug } from "../../config.ts";
import { flagBool, flagString } from "../../parse-args.ts";
import type { ParsedArgs } from "../../parse-args.ts";

export async function runAgentRun(
  config: CliConfig,
  args: ParsedArgs,
): Promise<number> {
  const bundlePath = flagString(args.flags, "bundle");
  if (!bundlePath) {
    console.error("Missing required flag: --bundle <path>");
    return 1;
  }

  const dryRun =
    flagBool(args.flags, "dry-run") ||
    process.env.ASF_AGENT_RUN_DRY_RUN === "1";

  let bundle;
  try {
    const raw = await Bun.file(bundlePath).json();
    bundle = validateContextBundle(raw);
  } catch (error) {
    console.error(
      "Bundle validation failed:",
      error instanceof Error ? error.message : error,
    );
    return 1;
  }

  const { context, agentType, contractVersion, taskExecutionId } = bundle;

  if (dryRun) {
    console.log(
      `Dry-run: ${agentType}@${contractVersion} task=${context.task.id} (${context.task.type})`,
    );
    console.log(`  mission: ${context.mission.id}`);
    console.log(`  workspace: ${context.workspace}`);
    console.log(`  execution: ${taskExecutionId}`);
    logDebug(config, "bundle context", context);
  }

  const stub = new StubAgentRuntime();
  const task = {
    id: context.task.id,
    missionId: context.mission.id,
    kind: "task" as const,
    type: context.task.type,
    title: context.task.title,
    description: context.task.description,
    assignedAgentType: agentType,
    dependencies: context.task.dependencies,
    acceptanceCriteria: context.task.acceptanceCriteria,
    parallelSafe: false,
    maxRetries: 3,
    parentTaskId: context.task.parentTaskId,
  };

  const result = stub.run(task, context.mission.id);
  await writeFile(bundle.resultPath, JSON.stringify(result, null, 2), "utf8");

  if (dryRun) {
    console.log(`  result: ${result.status} — ${result.summary}`);
    console.log(`  wrote: ${bundle.resultPath}`);
    return 0;
  }

  // M3: LLM loop + completeTask POST
  console.error("Real agent execution not implemented (M3). Use --dry-run.");
  return 1;
}
