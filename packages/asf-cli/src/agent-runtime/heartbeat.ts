export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_EXTEND_SECONDS = 120;

export type FetchFn = typeof fetch;

export interface HeartbeatOptions {
  engineUrl: string;
  taskExecutionId: string;
  executionToken: string;
  fetchFn?: FetchFn;
  intervalMs?: number;
  onLeaseLost?: () => void;
}

export interface HeartbeatHandle {
  stop: () => void;
}

/**
 * POST heartbeat every 30s while the agent is running (agent-contracts §1.2).
 */
export function startHeartbeatLoop(
  options: HeartbeatOptions,
): HeartbeatHandle {
  const fetchFn = options.fetchFn ?? fetch;
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      const res = await fetchFn(
        `${options.engineUrl}/internal/v1/tasks/${options.taskExecutionId}/heartbeat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.executionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ extendBySeconds: HEARTBEAT_EXTEND_SECONDS }),
        },
      );
      if (res.status === 404 || res.status === 409) {
        stopped = true;
        options.onLeaseLost?.();
      }
    } catch {
      // transient network errors — next tick retries
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
