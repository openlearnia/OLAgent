import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  createWorkflowServer,
  wireAgentRuntimeCaller,
  wireStubAgentRuntime,
} from "@olagent/workflow-engine";
import type { CliConfig } from "../config.ts";
import { logDebug, requireJwtSecret } from "../config.ts";
import { flagString } from "../parse-args.ts";
import type { ParsedArgs } from "../parse-args.ts";

export async function runServerStart(
  config: CliConfig,
  args: ParsedArgs,
): Promise<number> {
  const host = flagString(args.flags, "host") ?? process.env.HOST ?? "127.0.0.1";
  const port = Number(
    flagString(args.flags, "port") ?? process.env.PORT ?? "3100",
  );
  const dbPath = flagString(args.flags, "db-path") ?? config.dbPath;

  if (dbPath !== ":memory:") {
    await mkdir(path.dirname(dbPath), { recursive: true });
  }
  await mkdir(config.workspacesRoot, { recursive: true });

  const instance = createWorkflowServer({
    hostname: host,
    port,
    dbPath,
    workspacesRoot: config.workspacesRoot,
  });

  let unwiredAgents: (() => void) | undefined;
  const engineUrl = `http://${host}:${port}`;
  if (process.env.ASF_USE_STUB_AGENTS === "1") {
    unwiredAgents = wireStubAgentRuntime(instance.engine);
    logDebug(config, "Stub agent runtime enabled (ASF_USE_STUB_AGENTS=1)");
  } else {
    unwiredAgents = wireAgentRuntimeCaller(instance.engine, {
      jwtSecret: requireJwtSecret(),
      engineUrl,
    });
    logDebug(
      config,
      process.env.ASF_AGENT_RUN_DRY_RUN === "0"
        ? "Subprocess agent runtime (live — M3+)"
        : "Subprocess agent runtime (dry-run — M2)",
    );
  }

  console.log(`Listening on http://${instance.hostname}:${instance.port}`);

  const shutdown = () => {
    unwiredAgents?.();
    instance.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise<void>(() => {
    // keep process alive until signal
  });

  return 0;
}
