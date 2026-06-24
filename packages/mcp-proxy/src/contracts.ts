/**
 * Per-agent tool allowlists derived from agent-contracts.md.
 * Tool names use `server.tool` format (e.g. filesystem.read).
 */

const GLOBAL_GIT_DENY = new Set([
  "git.push",
  "git.merge",
  "git.reset",
  "git.rebase",
  "git.force-push",
]);

const AGENT_ALLOWLISTS: Record<string, Set<string>> = {
  "backend-engineer": new Set([
    "filesystem.read",
    "filesystem.write",
    "filesystem.list",
    "filesystem.delete",
    "git.status",
    "git.diff",
    "git.add",
    "git.commit",
    "git.branch",
    "git.checkout",
    "git.log",
    "terminal.run",
    "memory.commit",
    "memory.search",
    "memory.get",
    "database.query",
    "database.migrate",
    "database.schema",
    "vault.get",
  ]),
  planner: new Set([
    "filesystem.read",
    "filesystem.write",
    "filesystem.list",
    "filesystem.exists",
    "memory.commit",
    "memory.search",
    "memory.get",
    "memory.list_recent",
    "vault.get",
  ]),
};

const DEFAULT_ALLOWLIST = new Set([
  "filesystem.read",
  "filesystem.write",
  "filesystem.list",
  "git.status",
  "git.diff",
  "terminal.run",
  "vault.get",
]);

export function isToolAuthorized(agentType: string, toolName: string): boolean {
  if (GLOBAL_GIT_DENY.has(toolName)) return false;
  const allowlist = AGENT_ALLOWLISTS[agentType] ?? DEFAULT_ALLOWLIST;
  return allowlist.has(toolName);
}

export function listAuthorizedTools(agentType: string): string[] {
  const allowlist = AGENT_ALLOWLISTS[agentType] ?? DEFAULT_ALLOWLIST;
  return [...allowlist].filter((t) => !GLOBAL_GIT_DENY.has(t)).sort();
}
