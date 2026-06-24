import type { McpClient } from "@olagent/mcp-proxy";

export interface FilesystemHandlerContext {
  mcp: McpClient;
}

export async function handleFilesystemMethod(
  method: string,
  params: Record<string, unknown>,
  ctx: FilesystemHandlerContext,
): Promise<unknown> {
  const normalized = method.replace(/^fs\//, "").replace(/_/g, "");

  if (normalized === "readtextfile" || normalized === "read") {
    const path = String(params.path ?? "");
    const content = await ctx.mcp.filesystemRead(path);
    return { content, path };
  }

  if (normalized === "writetextfile" || normalized === "write") {
    const path = String(params.path ?? "");
    const content = String(params.content ?? "");
    await ctx.mcp.filesystemWrite(path, content);
    return { path, bytes: Buffer.byteLength(content, "utf8") };
  }

  if (normalized === "list" || normalized === "listdirectory") {
    const path = String(params.path ?? ".");
    return ctx.mcp.callTool("filesystem.list", { path });
  }

  throw new Error(`Unsupported filesystem ACP method: ${method}`);
}
