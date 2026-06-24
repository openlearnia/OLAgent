import {
  assertGitSubcommandAllowed,
  assertSafeRelativePath,
  extractGitSubcommand,
  isTerminalArgvAllowed,
} from "@olagent/mcp-proxy";

export type PermissionMode = "auto" | "strict";

export interface PermissionDecision {
  approved: boolean;
  optionId: "allow-once" | "allow-always" | "reject-once";
  reason?: string;
}

export interface PermissionParams {
  kind?: string;
  path?: string;
  argv?: string[];
  command?: string;
  tool?: string;
  [key: string]: unknown;
}

function parseArgv(params: PermissionParams): string[] | null {
  if (Array.isArray(params.argv)) return params.argv.map(String);
  if (typeof params.command === "string") {
    return params.command.split(/\s+/).filter(Boolean);
  }
  return null;
}

function filesystemKind(kind: string | undefined): "read" | "write" | "list" | null {
  if (!kind) return null;
  const lower = kind.toLowerCase();
  if (lower.includes("read") || lower.includes("filesystem.read")) return "read";
  if (lower.includes("write") || lower.includes("filesystem.write")) return "write";
  if (lower.includes("list") || lower.includes("filesystem.list")) return "list";
  if (lower.startsWith("filesystem")) return "read";
  return null;
}

/**
 * Pre-check permission requests against MCP sandbox policy before auto-approving.
 */
export function evaluatePermission(
  params: PermissionParams,
  workspace: string,
  mode: PermissionMode = "auto",
): PermissionDecision {
  if (mode === "strict") {
    return {
      approved: false,
      optionId: "reject-once",
      reason: "ASF_ACP_PERMISSION_MODE=strict",
    };
  }

  const fsOp = filesystemKind(params.kind ?? params.tool);
  if (fsOp && params.path) {
    try {
      assertSafeRelativePath(String(params.path));
      return { approved: true, optionId: "allow-once" };
    } catch {
      return {
        approved: false,
        optionId: "reject-once",
        reason: "PATH_OUT_OF_BOUNDS",
      };
    }
  }

  const argv = parseArgv(params);
  if (argv?.length) {
    if (!isTerminalArgvAllowed(argv)) {
      return {
        approved: false,
        optionId: "reject-once",
        reason: "COMMAND_NOT_ALLOWLISTED",
      };
    }
    const gitSub = extractGitSubcommand(argv);
    if (gitSub) {
      try {
        assertGitSubcommandAllowed(gitSub);
      } catch {
        return {
          approved: false,
          optionId: "reject-once",
          reason: "GIT_COMMAND_DENIED",
        };
      }
    }
    return { approved: true, optionId: "allow-once" };
  }

  const kind = String(params.kind ?? params.tool ?? "").toLowerCase();
  if (kind.includes("terminal") || kind.includes("shell") || kind.includes("exec")) {
    return {
      approved: false,
      optionId: "reject-once",
      reason: "terminal permission missing argv",
    };
  }

  // Unknown permission class — deny conservatively in auto mode
  return {
    approved: false,
    optionId: "reject-once",
    reason: "unknown permission kind",
  };
}

export function permissionResponse(decision: PermissionDecision): {
  outcome: { outcome: "selected"; optionId: string };
} {
  return {
    outcome: {
      outcome: "selected",
      optionId: decision.optionId,
    },
  };
}

export function resolvePermissionMode(): PermissionMode {
  return process.env.ASF_ACP_PERMISSION_MODE === "strict" ? "strict" : "auto";
}
