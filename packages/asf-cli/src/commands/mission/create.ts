import type { CliConfig } from "../../config.ts";
import { EngineClient } from "../../client.ts";
import { flagString } from "../../parse-args.ts";
import type { ParsedArgs } from "../../parse-args.ts";

export async function runMissionCreate(
  config: CliConfig,
  args: ParsedArgs,
): Promise<number> {
  const client = new EngineClient(config);
  const file = flagString(args.flags, "file");
  const goal = flagString(args.flags, "goal");
  const idempotencyKey = flagString(args.flags, "idempotency-key");

  if (!file && !goal) {
    console.error("Error: --file or --goal is required");
    return 1;
  }
  if (file && goal) {
    console.error("Error: --file and --goal are mutually exclusive");
    return 1;
  }

  try {
    const projection = file
      ? await client.createMissionFromFile(file, { idempotencyKey })
      : await client.createMissionFromGoal(goal!, {
          id: flagString(args.flags, "id"),
          idempotencyKey,
        });

    if (config.json) {
      console.log(JSON.stringify(projection.mission, null, 2));
    } else {
      console.log(
        `Created mission ${projection.mission.id} (${projection.mission.status})`,
      );
      console.log(`  goal: ${projection.mission.goal}`);
      console.log(`  workspace: ${projection.mission.workspacePath}`);
    }
    return 0;
  } catch (error) {
    console.error(`Error: ${formatError(error)}`);
    return 1;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
