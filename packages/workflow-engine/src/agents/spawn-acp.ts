import {
  resolveCursorAgentBin,
  resolvePermissionMode,
  runCursorAcpSession,
  type AcpSessionResult,
  type RunCursorAcpSessionOptions,
} from "@olagent/acp-client";
import type { ContextBundle } from "./bundle.ts";
import { startHeartbeatLoop } from "./heartbeat.ts";

export interface SpawnCursorAcpOptions {
  engineUrl: string;
  executionToken: string;
  agentBin?: string;
  agentArgs?: string[];
  permissionMode?: ReturnType<typeof resolvePermissionMode>;
  acpOptions?: Omit<
    RunCursorAcpSessionOptions,
    "agentBin" | "agentArgs" | "permissionMode"
  >;
}

/**
 * Run Cursor `agent acp` with caller-owned heartbeat relay (M5b).
 */
export async function spawnCursorAcpSession(
  bundle: ContextBundle,
  options: SpawnCursorAcpOptions,
): Promise<AcpSessionResult> {
  const heartbeat = startHeartbeatLoop({
    engineUrl: options.engineUrl,
    taskExecutionId: bundle.taskExecutionId,
    executionToken: options.executionToken,
  });

  try {
    return await runCursorAcpSession(bundle, {
      agentBin: options.agentBin ?? resolveCursorAgentBin(),
      agentArgs: options.agentArgs ?? ["acp"],
      permissionMode: options.permissionMode ?? resolvePermissionMode(),
      ...options.acpOptions,
    });
  } finally {
    heartbeat.stop();
  }
}
