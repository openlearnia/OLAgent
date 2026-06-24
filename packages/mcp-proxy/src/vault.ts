import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpProxyError } from "./errors.ts";

export interface VaultGetResult {
  secretRef: string;
  value: string;
  source: "env" | "file";
}

/**
 * Minimal vault stub — reads from env map or `.asf/secrets.json`.
 * Never pass secret values in context bundles; inject at tool boundary only.
 */
export async function vaultGet(
  secretRef: string,
  _sessionId: string,
  workspace: string,
): Promise<VaultGetResult> {
  if (!secretRef || typeof secretRef !== "string") {
    throw new McpProxyError("INVALID_INPUT", "secretRef is required");
  }

  const envKey = secretRefToEnvKey(secretRef);
  if (process.env[envKey]) {
    return { secretRef, value: process.env[envKey]!, source: "env" };
  }

  const secretsPath = path.join(workspace, ".asf", "secrets.json");
  try {
    const raw = await readFile(secretsPath, "utf8");
    const map = JSON.parse(raw) as Record<string, string>;
    const key = secretRef.replace(/^vault:\/\//, "");
    if (map[key]) {
      return { secretRef, value: map[key], source: "file" };
    }
  } catch {
    // no secrets file
  }

  throw new McpProxyError(
    "TOOL_ERROR",
    `Secret not found for ref: ${secretRef}`,
  );
}

function secretRefToEnvKey(secretRef: string): string {
  const key = secretRef.replace(/^vault:\/\//, "").replace(/[/:.-]/g, "_").toUpperCase();
  return `ASF_VAULT_${key}`;
}
