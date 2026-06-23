import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ProvisionWorkspaceOptions {
  missionId: string;
  missionDocument?: Record<string, unknown>;
  workspacesRoot?: string;
}

export function resolveWorkspacesRoot(): string {
  return (
    process.env.ASF_WORKSPACES_ROOT ??
    path.join(process.cwd(), "workspaces")
  );
}

export async function provisionMissionWorkspace(
  options: ProvisionWorkspaceOptions,
): Promise<string> {
  const root = options.workspacesRoot ?? resolveWorkspacesRoot();
  const workspacePath = path.join(root, options.missionId);

  await mkdir(path.join(workspacePath, "artifacts"), { recursive: true });
  await mkdir(path.join(workspacePath, "tasks"), { recursive: true });
  await mkdir(path.join(workspacePath, ".asf"), { recursive: true });

  if (options.missionDocument) {
    const yaml = Bun.YAML.stringify(options.missionDocument);
    await writeFile(path.join(workspacePath, "mission.yaml"), yaml, "utf8");
  }

  return workspacePath;
}
