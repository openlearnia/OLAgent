import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  createWorkflowServer,
  wireStubAgentRuntime,
} from "@olagent/workflow-engine";
import type { CliConfig } from "../config.ts";
import { logDebug } from "../config.ts";
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

  let unwiredStub: (() => void) | undefined;
  if (process.env.ASF_USE_STUB_AGENTS === "1") {
    unwiredStub = wireStubAgentRuntime(instance.engine);
    logDebug(config, "Stub agent runtime enabled (ASF_USE_STUB_AGENTS=1)");
  }

  console.log(`Listening on http://${instance.hostname}:${instance.port}`);

  const shutdown = () => {
    unwiredStub?.();
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
