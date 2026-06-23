import type { CliConfig } from "../../config.ts";
import { EngineClient, EngineError } from "../../client.ts";
import type { ParsedArgs } from "../../parse-args.ts";

const TERMINAL = new Set(["SUCCESS", "FAILED", "BLOCKED", "CANCELLED"]);

export async function runMissionStatus(
  config: CliConfig,
  args: ParsedArgs,
): Promise<number> {
  const missionId = args.positional[0];
  if (!missionId) {
    console.error("Error: missionId is required");
    return 1;
  }

  const client = new EngineClient(config);
  try {
    const projection = await client.getMission(missionId);
    if (config.json) {
      console.log(JSON.stringify(projection, null, 2));
      return statusExitCode(projection.mission.status);
    }

    printHumanStatus(projection);
    return statusExitCode(projection.mission.status);
  } catch (error) {
    if (error instanceof EngineError) {
      console.error(`Engine error: ${error.message}`);
      return 2;
    }
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

function statusExitCode(status: string): number {
  if (status === "SUCCESS") return 0;
  if (status === "FAILED" || status === "BLOCKED") return 1;
  if (status === "RUNNING" || status === "PENDING") return 2;
  return 0;
}

function printHumanStatus(projection: {
  mission: { id: string; status: string };
  tasks: Array<{
    id: string;
    status: string;
    assignedAgentType: string;
    title: string;
  }>;
}): void {
  const total = projection.tasks.length;
  const done = projection.tasks.filter((t) => t.status === "SUCCESS").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  console.log(
    `Mission ${projection.mission.id}  ${projection.mission.status}  (${done}/${total} tasks, ${pct}%)`,
  );

  for (const task of projection.tasks) {
    const agent =
      task.status === "RUNNING" ? `  ${task.assignedAgentType}` : "";
    console.log(`  ${task.id.padEnd(22)} ${task.status}${agent}`);
  }
}

export { TERMINAL };
