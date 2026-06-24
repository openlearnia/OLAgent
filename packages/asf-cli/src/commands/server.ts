import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  createWorkflowServer,
  wireAgentRuntimeCaller,
  wireStubAgentRuntime,
} from "@olagent/workflow-engine";
import { createMcpProxyServer, resolveMcpPort } from "@olagent/mcp-proxy";
import type { CliConfig } from "../config.ts";
import { logDebug, requireJwtSecret } from "../config.ts";
import { flagString } from "../parse-args.ts";
import type { ParsedArgs } from "../parse-args.ts";

let mcpServer: ReturnType<typeof createMcpProxyServer> | null = null;

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

  const mcpPort = Number(process.env.ASF_MCP_PORT ?? resolveMcpPort());
  mcpServer = createMcpProxyServer({ hostname: host, port: mcpPort });
  const mcpEndpoint = mcpServer.url;
  process.env.ASF_MCP_ENDPOINT = mcpEndpoint;
  logDebug(config, `MCP proxy on ${mcpEndpoint}`);

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
      mcpEndpoint,
    });
    const backend = process.env.ASF_AGENT_BACKEND ?? "cursor-acp";
    const live =
      process.env.ASF_AGENT_RUN_DRY_RUN === "0"
        ? `live (${backend})`
        : "dry-run (M2)";
    logDebug(config, `Subprocess agent runtime — ${live}`);
  }

  console.log(`Listening on http://${instance.hostname}:${instance.port}`);
  console.log(`MCP proxy on ${mcpEndpoint}`);

  const shutdown = () => {
    unwiredAgents?.();
    mcpServer?.stop();
    mcpServer = null;
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
