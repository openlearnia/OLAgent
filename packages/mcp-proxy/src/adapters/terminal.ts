import { McpProxyError } from "../errors.ts";
import {
  DEFAULT_TERMINAL_ALLOWLIST,
  extractGitSubcommand,
  isTerminalArgvAllowed,
} from "../allowlists.ts";
import { assertGitSubcommandAllowed } from "../allowlists.ts";

export interface TerminalRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function terminalRun(
  workspace: string,
  argv: string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    allowlist?: string[];
  } = {},
): Promise<TerminalRunResult> {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new McpProxyError("INVALID_INPUT", "argv array is required");
  }

  const allowlist = options.allowlist ?? DEFAULT_TERMINAL_ALLOWLIST;
  if (!isTerminalArgvAllowed(argv, allowlist)) {
    throw new McpProxyError(
      "COMMAND_NOT_ALLOWLISTED",
      `command not allowlisted: ${argv[0]}`,
    );
  }

  const gitSub = extractGitSubcommand(argv);
  if (gitSub) {
    try {
      assertGitSubcommandAllowed(gitSub);
    } catch {
      throw new McpProxyError("GIT_COMMAND_DENIED", `git ${gitSub} is denied`);
    }
  }

  const cwd = options.cwd ? workspace : workspace;
  const timeoutMs = options.timeoutMs ?? 300_000;

  const proc = Bun.spawn({
    cmd: argv,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

  const timeout = setTimeout(() => {
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timeout);

  return { stdout, stderr, exitCode };
}
