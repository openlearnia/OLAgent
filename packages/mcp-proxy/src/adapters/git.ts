import { McpProxyError } from "../errors.ts";
import { assertGitSubcommandAllowed } from "../allowlists.ts";

async function runGit(
  workspace: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const subcommand = args[0];
  if (!subcommand) {
    throw new McpProxyError("INVALID_INPUT", "git subcommand required");
  }
  assertGitSubcommandAllowed(subcommand);

  const proc = Bun.spawn({
    cmd: ["git", ...args],
    cwd: workspace,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

export async function gitStatus(workspace: string): Promise<{ output: string }> {
  const result = await runGit(workspace, ["status", "--porcelain", "-b"]);
  return { output: result.stdout || result.stderr };
}

export async function gitDiff(
  workspace: string,
  options: { path?: string; staged?: boolean } = {},
): Promise<{ output: string }> {
  const args = ["diff"];
  if (options.staged) args.push("--cached");
  if (options.path) args.push("--", options.path);
  const result = await runGit(workspace, args);
  return { output: result.stdout };
}
