import type { CliConfig } from "../../config.ts";
import {
  EngineClient,
  EngineError,
  isTerminalMissionStatus,
  missionWatchExitCode,
} from "../../client.ts";
import { flagBool, flagNumber } from "../../parse-args.ts";
import type { ParsedArgs } from "../../parse-args.ts";

export async function runMissionWatch(
  config: CliConfig,
  args: ParsedArgs,
): Promise<number> {
  const missionId = args.positional[0];
  if (!missionId) {
    console.error("Error: missionId is required");
    return 1;
  }

  const intervalSec = flagNumber(args.flags, "interval", 5);
  const showEvents = flagBool(args.flags, "events");
  const client = new EngineClient(config);

  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
  };
  process.on("SIGINT", onSigint);

  try {
    while (!interrupted) {
      const projection = await client.getMission(missionId);
      const { mission, tasks } = projection;
      const done = tasks.filter((t) => t.status === "SUCCESS").length;
      const running = tasks.filter((t) => t.status === "RUNNING");

      if (config.json) {
        console.log(JSON.stringify({ mission, progress: { done, total: tasks.length } }));
      } else {
        const pct =
          tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
        console.log(
          `[${new Date().toISOString()}] ${mission.id} ${mission.status} (${done}/${tasks.length}, ${pct}%)` +
            (running.length
              ? ` — running: ${running.map((t) => t.id).join(", ")}`
              : ""),
        );
      }

      if (showEvents) {
        const { events } = await client.getEvents(missionId, 5);
        for (const event of events.slice(-3)) {
          console.log(`  event: ${event.type}`);
        }
      }

      if (isTerminalMissionStatus(mission.status)) {
        process.off("SIGINT", onSigint);
        return missionWatchExitCode(mission.status);
      }

      await Bun.sleep(intervalSec * 1000);
    }

    process.off("SIGINT", onSigint);
    return 130;
  } catch (error) {
    process.off("SIGINT", onSigint);
    if (error instanceof EngineError) {
      console.error(`Engine error: ${error.message}`);
      return 2;
    }
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
