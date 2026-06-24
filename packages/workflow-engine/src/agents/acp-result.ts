import type { AcpSessionResult } from "@olagent/acp-client";
import type { AgentResult } from "../types.ts";

function isAcpSessionSuccessful(session: AcpSessionResult): boolean {
  if (session.error) return false;
  if (session.stopReason != null && session.stopReason.length > 0) return true;
  return session.exitCode === 0;
}

/**
 * Map ACP session outcome → engine `AgentResult` (caller POSTs completeTask).
 */
export function mapAcpSessionToAgentResult(session: AcpSessionResult): AgentResult {
  if (!isAcpSessionSuccessful(session)) {
    return {
      status: "FAILED",
      artifacts: session.artifactsHint,
      commits: [],
      summary:
        session.error?.message ??
        `Cursor ACP session exited with code ${session.exitCode}`,
      error: session.error
        ? {
            code: session.error.code,
            message: session.error.message,
            recoverable: session.error.recoverable ?? true,
          }
        : {
            code: "ACP_SESSION_FAILED",
            message: `agent acp exited ${session.exitCode}`,
            recoverable: session.exitCode !== 1,
          },
      metrics: {
        tokenUsage: { input: 0, output: 0 },
        durationMs: session.durationMs,
      },
    };
  }

  const summary =
    session.stopReason != null
      ? `Cursor ACP session completed (${session.stopReason})`
      : "Cursor ACP session completed";

  return {
    status: "COMPLETED",
    artifacts: session.artifactsHint,
    commits: [],
    summary,
    metrics: {
      tokenUsage: { input: 0, output: 0 },
      durationMs: session.durationMs,
    },
  };
}
