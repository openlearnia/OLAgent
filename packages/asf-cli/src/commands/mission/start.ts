import type { CliConfig } from "../../config.ts";
import { EngineClient, EngineError } from "../../client.ts";
import type { ParsedArgs } from "../../parse-args.ts";

export async function runMissionStart(
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
    const result = await client.startMission(missionId);
    if (config.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Started mission ${missionId}`);
    }
    return 0;
  } catch (error) {
    if (error instanceof EngineError) {
      console.error(`Engine error: ${error.message}`);
      return 2;
    }
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
