import type { WorkflowEvent } from "../types.ts";

export type WorkflowEventListener = (event: WorkflowEvent) => void;

export class WorkflowEventBus {
  private readonly listeners = new Set<WorkflowEventListener>();

  subscribe(listener: WorkflowEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: WorkflowEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
