import { loadConfig } from "./config.ts";
import { runDevToken } from "./commands/dev.ts";
import { runMissionCreate } from "./commands/mission/create.ts";
import { runMissionEvents } from "./commands/mission/events.ts";
import { runMissionStart } from "./commands/mission/start.ts";
import { runMissionStatus } from "./commands/mission/status.ts";
import { runMissionWatch } from "./commands/mission/watch.ts";
import { runServerStart } from "./commands/server.ts";
import {
  flagBool,
  flagString,
  parseArgs,
  usage,
} from "./parse-args.ts";

export async function runCli(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const config = loadConfig({
    home: flagString(flags, "home"),
    engineUrl: flagString(flags, "engine-url"),
    verbose: flagBool(flags, "verbose"),
    json: flagBool(flags, "json"),
  });

  const [group, sub, action] = positional;

  if (!group || group === "help" || flags.has("help")) {
    console.log(usage());
    return 0;
  }

  if (group === "server" && sub === "start") {
    return runServerStart(config, { positional: positional.slice(2), flags });
  }

  if (group === "dev" && sub === "token") {
    return runDevToken(config, { positional: positional.slice(2), flags });
  }

  if (group === "mission") {
    const missionArgs = { positional: positional.slice(2), flags };
    switch (sub) {
      case "create":
        return runMissionCreate(config, missionArgs);
      case "start":
        return runMissionStart(config, missionArgs);
      case "status":
        return runMissionStatus(config, missionArgs);
      case "watch":
        return runMissionWatch(config, missionArgs);
      case "events":
        return runMissionEvents(config, missionArgs);
      default:
        console.error(`Unknown mission command: ${sub ?? "(none)"}`);
        console.log(usage());
        return 1;
    }
  }

  console.error(`Unknown command: ${group}${sub ? ` ${sub}` : ""}`);
  console.log(usage());
  return 1;
}
