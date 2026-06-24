export type AgentBackend = "cursor-acp" | "custom-llm" | "stub";

export interface BackendResolution {
  backend: AgentBackend;
  /** When true, spawn `asf agent run --dry-run` and caller POSTs completeTask. */
  dryRun: boolean;
}

function parseCommaSet(raw: string | undefined, fallback: string): Set<string> {
  const value = raw ?? fallback;
  return new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Agent types routed to Cursor `agent acp` when backend is `cursor-acp`.
 * `ASF_LLM_AGENT_TYPES` is honored as a legacy alias for custom-llm pilot types.
 */
export function resolveCursorAgentTypes(): Set<string> {
  const raw =
    process.env.ASF_CURSOR_AGENT_TYPES ??
    process.env.ASF_LLM_AGENT_TYPES ??
    "backend-engineer";
  return parseCommaSet(raw, "backend-engineer");
}

export function resolveCustomLlmAgentTypes(): Set<string> {
  return parseCommaSet(
    process.env.ASF_LLM_AGENT_TYPES ?? process.env.ASF_CURSOR_AGENT_TYPES,
    "backend-engineer",
  );
}

/**
 * Global agent backend selection (ADR-003).
 *
 * | `ASF_AGENT_BACKEND` | When used |
 * |---------------------|-----------|
 * | `cursor-acp` | Default — Cursor `agent acp` for types in `ASF_CURSOR_AGENT_TYPES` |
 * | `custom-llm` | M3 `asf agent run` LLM loop (CI / fallback without Cursor) |
 * | `stub` | Same as `ASF_USE_STUB_AGENTS=1` (in-process; server wiring) |
 *
 * If unset, defaults to `cursor-acp`. Set `ASF_AGENT_BACKEND=custom-llm` explicitly
 * when Cursor is unavailable; do not auto-fallback based on `CURSOR_API_KEY` alone.
 */
export function resolveAgentBackend(): AgentBackend {
  const explicit = process.env.ASF_AGENT_BACKEND?.trim().toLowerCase();
  if (explicit === "custom-llm" || explicit === "stub" || explicit === "cursor-acp") {
    return explicit;
  }
  return "cursor-acp";
}

export function isGlobalDryRun(override?: boolean): boolean {
  if (override !== undefined) return override;
  return process.env.ASF_AGENT_RUN_DRY_RUN !== "0";
}

/**
 * Per-task spawn routing for Agent Runtime Caller.
 */
export function resolveTaskBackend(
  agentType: string,
  options: { dryRun?: boolean } = {},
): BackendResolution {
  const dryRun = isGlobalDryRun(options.dryRun);
  if (dryRun) {
    return { backend: "custom-llm", dryRun: true };
  }

  const backend = resolveAgentBackend();
  if (backend === "stub") {
    return { backend: "stub", dryRun: false };
  }

  if (backend === "cursor-acp" && resolveCursorAgentTypes().has(agentType)) {
    return { backend: "cursor-acp", dryRun: false };
  }

  if (backend === "custom-llm" && resolveCustomLlmAgentTypes().has(agentType)) {
    return { backend: "custom-llm", dryRun: false };
  }

  return { backend: "custom-llm", dryRun: true };
}
