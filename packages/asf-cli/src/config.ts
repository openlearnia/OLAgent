import os from "node:os";
import path from "node:path";

export interface CliConfig {
  home: string;
  engineUrl: string;
  workspacesRoot: string;
  dbPath: string;
  verbose: boolean;
  json: boolean;
}

export interface ConfigOverrides {
  home?: string;
  engineUrl?: string;
  workspacesRoot?: string;
  dbPath?: string;
  verbose?: boolean;
  json?: boolean;
}

function expandHome(value: string): string {
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  if (value === "~") {
    return os.homedir();
  }
  return value;
}

export function resolveAsfHome(override?: string): string {
  const raw = override ?? process.env.ASF_HOME ?? path.join(os.homedir(), ".asf");
  return expandHome(raw);
}

export function resolveWorkspacesRoot(home?: string): string {
  const root =
    process.env.ASF_WORKSPACES_ROOT ??
    path.join(resolveAsfHome(home), "workspaces");
  return expandHome(root);
}

export function resolveEngineUrl(override?: string): string {
  return (override ?? process.env.ASF_ENGINE_URL ?? "http://127.0.0.1:3100").replace(
    /\/$/,
    "",
  );
}

export function resolveDbPath(home?: string, override?: string): string {
  const raw =
    override ??
    process.env.WORKFLOW_DB_PATH ??
    path.join(resolveAsfHome(home), "workflow.db");
  return expandHome(raw);
}

export function loadConfig(overrides: ConfigOverrides = {}): CliConfig {
  const home = resolveAsfHome(overrides.home);
  return {
    home,
    engineUrl: resolveEngineUrl(overrides.engineUrl),
    workspacesRoot: overrides.workspacesRoot
      ? expandHome(overrides.workspacesRoot)
      : resolveWorkspacesRoot(home),
    dbPath: resolveDbPath(home, overrides.dbPath),
    verbose: overrides.verbose ?? process.env.ASF_VERBOSE === "1",
    json: overrides.json ?? false,
  };
}

export function requireJwtSecret(): string {
  const secret = process.env.ASF_INTERNAL_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "ASF_INTERNAL_JWT_SECRET is required for internal API calls",
    );
  }
  return secret;
}

export function logDebug(config: CliConfig, message: string, data?: unknown): void {
  if (!config.verbose) return;
  if (data !== undefined) {
    console.error(`[asf] ${message}`, data);
  } else {
    console.error(`[asf] ${message}`);
  }
}
