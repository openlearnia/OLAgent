import { McpProxyError } from "./errors.ts";

/** Default terminal argv[0] prefix allowlist per security.md § Terminal Allowlist Policy */
export const DEFAULT_TERMINAL_ALLOWLIST: string[] = [
  "bun",
  "npm",
  "bunx",
  "npx",
  "git",
  "wrangler",
  "docker",
  "tsc",
];

/** Global git subcommand denylist per agent-contracts §1.3 */
export const GIT_GLOBAL_DENYLIST = new Set([
  "push",
  "merge",
  "reset",
  "rebase",
  "force-push",
]);

const DESTRUCTIVE_PATTERNS = [
  /^rm\s+-rf\s+\//,
  /^mkfs\b/,
  /^dd\s+if=/,
  /:\(\)\{.*\};/,
];

export function isTerminalArgvAllowed(
  argv: string[],
  allowlist: string[] = DEFAULT_TERMINAL_ALLOWLIST,
): boolean {
  if (!argv.length || typeof argv[0] !== "string") return false;

  const joined = argv.join(" ");
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(joined)) return false;
  }
  if (joined.includes("rm -rf /")) return false;

  const base = argv[0].split("/").pop() ?? argv[0];
  const prefix = argv.slice(0, 2).join(" ");

  return allowlist.some((entry) => {
    if (entry.includes(" ")) {
      return prefix === entry || joined.startsWith(`${entry} `);
    }
    return base === entry || argv[0] === entry;
  });
}

export function assertGitSubcommandAllowed(subcommand: string): void {
  if (GIT_GLOBAL_DENYLIST.has(subcommand)) {
    throw new McpProxyError("GIT_COMMAND_DENIED", `git ${subcommand} is not allowed`);
  }
}

export function extractGitSubcommand(argv: string[]): string | null {
  if (!argv.length) return null;
  const cmd = argv[0];
  if (cmd === "git" && argv[1]) return argv[1];
  if (cmd.endsWith("/git") && argv[1]) return argv[1];
  return null;
}
