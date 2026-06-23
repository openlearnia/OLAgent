import type { CliConfig } from "../../config.ts";
import { EngineClient, EngineError } from "../../client.ts";
import { flagNumber } from "../../parse-args.ts";
import type { ParsedArgs } from "../../parse-args.ts";

export async function runMissionEvents(
  config: CliConfig,
  args: ParsedArgs,
): Promise<number> {
  const missionId = args.positional[0];
  if (!missionId) {
    console.error("Error: missionId is required");
    return 1;
  }

  const limit = flagNumber(args.flags, "limit", 20);
  const client = new EngineClient(config);

  try {
    const { events } = await client.getEvents(missionId, limit);
    if (config.json) {
      console.log(JSON.stringify({ events }, null, 2));
    } else {
      for (const event of events) {
        console.log(`${event.createdAt}  ${event.type}`);
      }
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
