import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveJailedPath } from "../path-jail.ts";

export async function filesystemRead(workspace: string, filePath: string): Promise<string> {
  const resolved = await resolveJailedPath(workspace, filePath);
  return readFile(resolved, "utf8");
}

export async function filesystemWrite(
  workspace: string,
  filePath: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  const resolved = await resolveJailedPath(workspace, filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, content, "utf8");
  return { path: filePath, bytes: Buffer.byteLength(content, "utf8") };
}

export async function filesystemList(
  workspace: string,
  dirPath: string = ".",
): Promise<{ entries: Array<{ name: string; type: "file" | "directory" }> }> {
  const resolved = await resolveJailedPath(workspace, dirPath);
  const names = await readdir(resolved, { withFileTypes: true });
  return {
    entries: names.map((d) => ({
      name: d.name,
      type: d.isDirectory() ? "directory" : "file",
    })),
  };
}
