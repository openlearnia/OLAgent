import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AsfBinaryResolution {
  /** argv[0] for spawn */
  command: string;
  /** Prefix args before `agent run ...` (e.g. `bun run /path/to/main.ts`) */
  prefixArgs: string[];
}

/**
 * Resolve how to invoke `asf agent run` from the server process.
 * Order: ASF_BIN env → `asf` on PATH → `bun run packages/asf-cli/src/main.ts`.
 */
export function resolveAsfBinary(): AsfBinaryResolution {
  if (process.env.ASF_BIN) {
    return { command: process.env.ASF_BIN, prefixArgs: [] };
  }

  const onPath = Bun.which("asf");
  if (onPath) {
    return { command: onPath, prefixArgs: [] };
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const mainTs = path.resolve(here, "../../../asf-cli/src/main.ts");
  const bun = process.execPath.endsWith("bun") ? process.execPath : "bun";
  return { command: bun, prefixArgs: ["run", mainTs] };
}

export function buildAgentRunArgv(
  bundlePath: string,
  options: { dryRun?: boolean } = {},
): string[] {
  const { command, prefixArgs } = resolveAsfBinary();
  const args = [
    ...prefixArgs,
    "agent",
    "run",
    "--bundle",
    bundlePath,
  ];
  if (options.dryRun) {
    args.push("--dry-run");
  }
  return [command, ...args];
}
