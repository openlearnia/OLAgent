import path from "node:path";

export interface SandboxHandle {
  restore: () => void;
}

/**
 * Enter workspace jail: chdir to mission workspace and validate path root.
 */
export function enterWorkspaceSandbox(
  workspace: string,
  workspacesRoot?: string,
): SandboxHandle {
  const resolved = path.resolve(workspace);
  const root = path.resolve(
    workspacesRoot ?? process.env.ASF_WORKSPACES_ROOT ?? resolved,
  );

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Workspace ${resolved} is outside allowed root ${root}`,
    );
  }

  const previous = process.cwd();
  process.chdir(resolved);

  return {
    restore: () => {
      process.chdir(previous);
    },
  };
}
