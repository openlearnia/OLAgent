import type { McpClient } from "@olagent/mcp-proxy";

export interface TerminalHandlerContext {
  mcp: McpClient;
}

/**
 * Minimal terminal bridge for M5a — delegates argv exec to MCP terminal.run.
 */
export async function handleTerminalMethod(
  method: string,
  params: Record<string, unknown>,
  ctx: TerminalHandlerContext,
): Promise<unknown> {
  const normalized = method.replace(/^terminal\//, "").replace(/_/g, "");

  if (normalized === "run" || normalized === "exec" || normalized === "create") {
    const argv = Array.isArray(params.argv)
      ? params.argv.map(String)
      : typeof params.command === "string"
        ? params.command.split(/\s+/).filter(Boolean)
        : null;

    if (!argv?.length) {
      throw new Error("terminal.run requires argv or command");
    }

    return ctx.mcp.callTool("terminal.run", {
      argv,
      cwd: params.cwd,
      timeoutMs: params.timeoutMs,
    });
  }

  if (normalized === "waitforexit") {
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  throw new Error(`Unsupported terminal ACP method: ${method} (M5a stub)`);
}
