import type { WorkflowEngine } from "./engine.ts";
import { nowIso } from "./db.ts";

export interface LeaseSweeperOptions {
  intervalMs?: number;
  onStartup?: boolean;
}

export interface LeaseSweeperHandle {
  stop: () => void;
  sweepOnce: () => number;
}

export function startLeaseSweeper(
  engine: WorkflowEngine,
  options: LeaseSweeperOptions = {},
): LeaseSweeperHandle {
  const intervalMs = options.intervalMs ?? 60_000;

  const sweepOnce = () => sweepExpiredLeases(engine);

  if (options.onStartup !== false) {
    const recovered = sweepOnce();
    if (recovered > 0) {
      engine.getStore().emitEvent({
        type: "orchestrator.recovered",
        missionId: "system",
        idempotencyKey: `orchestrator.recovered:${nowIso()}`,
        payload: { recoveredExecutions: recovered },
      });
    }
  }

  const timer = setInterval(sweepOnce, intervalMs);

  return {
    stop: () => clearInterval(timer),
    sweepOnce,
  };
}

function sweepExpiredLeases(engine: WorkflowEngine): number {
  const now = engine.getNow();
  return engine.getStore().failExpiredRunningLeases(now);
}
