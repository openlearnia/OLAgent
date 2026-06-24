import { realpath } from "node:fs/promises";
import path from "node:path";
import { McpProxyError } from "./errors.ts";

/**
 * Reject path segments containing `..` or absolute paths outside workspace.
 */
export function assertSafeRelativePath(inputPath: string): void {
  if (!inputPath || typeof inputPath !== "string") {
    throw new McpProxyError("INVALID_INPUT", "path is required");
  }
  if (path.isAbsolute(inputPath)) {
    throw new McpProxyError("PATH_OUT_OF_BOUNDS", "absolute paths are not allowed");
  }
  const normalized = path.normalize(inputPath);
  if (normalized.startsWith("..") || normalized.includes(`${path.sep}..`)) {
    throw new McpProxyError("PATH_OUT_OF_BOUNDS", `path traversal rejected: ${inputPath}`);
  }
}

/**
 * Resolve a relative path within workspace and verify it stays inside the jail.
 */
export async function resolveJailedPath(
  workspace: string,
  inputPath: string,
): Promise<string> {
  assertSafeRelativePath(inputPath);
  const workspaceRoot = await resolveWorkspaceRoot(workspace);
  const candidate = path.resolve(workspaceRoot, inputPath);

  if (!candidate.startsWith(workspaceRoot + path.sep) && candidate !== workspaceRoot) {
    throw new McpProxyError("PATH_OUT_OF_BOUNDS", `path escapes workspace: ${inputPath}`);
  }

  try {
    const resolved = await realpath(candidate);
    if (!resolved.startsWith(workspaceRoot + path.sep) && resolved !== workspaceRoot) {
      throw new McpProxyError(
        "PATH_OUT_OF_BOUNDS",
        `symlink escapes workspace: ${inputPath}`,
      );
    }
    return resolved;
  } catch (error) {
    if (error instanceof McpProxyError) throw error;
    // File may not exist yet (write) — use candidate without realpath
    return candidate;
  }
}

async function resolveWorkspaceRoot(workspace: string): Promise<string> {
  try {
    return await realpath(path.resolve(workspace));
  } catch {
    return path.resolve(workspace);
  }
}
