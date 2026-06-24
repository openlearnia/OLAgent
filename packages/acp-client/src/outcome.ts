export interface SessionUpdate {
  method: string;
  params: unknown;
  receivedAt: string;
}

export interface AcpSessionResult {
  exitCode: number;
  acpSessionId?: string;
  stopReason?: string;
  updates: SessionUpdate[];
  artifactsHint: string[];
  startedAt: number;
  durationMs: number;
  error?: { code: string; message: string; recoverable?: boolean };
}

export function collectSessionUpdate(
  updates: SessionUpdate[],
  method: string,
  params: unknown,
): void {
  updates.push({
    method,
    params,
    receivedAt: new Date().toISOString(),
  });
}

export function extractArtifactsHint(updates: SessionUpdate[]): string[] {
  const hints = new Set<string>();

  for (const update of updates) {
    const params = update.params as { update?: { content?: { text?: string } } } | undefined;
    const text = params?.update?.content?.text;
    if (typeof text === "string") {
      const matches = text.match(/[`']?([a-zA-Z0-9_./-]+\.(ts|tsx|js|jsx|sql|yaml|json|md))[`']?/g);
      if (matches) {
        for (const match of matches) {
          hints.add(match.replace(/[`']/g, ""));
        }
      }
    }
  }

  return [...hints];
}

export function assembleSessionResult(input: {
  exitCode: number;
  acpSessionId?: string;
  stopReason?: string;
  updates: SessionUpdate[];
  startedAt: number;
  error?: AcpSessionResult["error"];
}): AcpSessionResult {
  return {
    exitCode: input.exitCode,
    acpSessionId: input.acpSessionId,
    stopReason: input.stopReason,
    updates: input.updates,
    artifactsHint: extractArtifactsHint(input.updates),
    startedAt: input.startedAt,
    durationMs: Date.now() - input.startedAt,
    error: input.error,
  };
}
