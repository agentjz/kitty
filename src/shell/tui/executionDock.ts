import { ExecutionStore } from "../../execution/store.js";
import type { TuiController } from "./controller.js";
import type { TuiRuntimeDockState } from "./store.js";

const EXECUTION_DOCK_POLL_INTERVAL_MS = 250;

interface TuiExecutionDockFact {
  status: string;
  risk?: "none" | "watch" | "blocked";
}

export function projectTuiExecutionDockFacts(executions: readonly TuiExecutionDockFact[]): Pick<TuiRuntimeDockState, "background"> {
  const active = executions.filter((execution) => execution.status === "created" || execution.status === "running");
  if (active.length === 0) return { background: undefined };
  const attention = active.filter((execution) => execution.risk && execution.risk !== "none").length;
  return {
    background: [
      `${active.length} ${active[0]?.status ?? "active"}`,
      attention > 0 ? `${attention} attention` : undefined,
    ].filter(Boolean).join("; "),
  };
}

export function readTuiLiveExecutionDock(input: {
  rootDir: string;
  cwd: string;
  ownerSessionId: string;
}): Pick<TuiRuntimeDockState, "background"> {
  const executions = new ExecutionStore(input.rootDir).list({
    statuses: ["created", "running"],
    cwd: input.cwd,
    ownerSessionId: input.ownerSessionId,
  });
  return projectTuiExecutionDockFacts(executions);
}

export function createTuiExecutionDockWatcher(input: {
  controller: TuiController;
  readLiveDock: () => Pick<TuiRuntimeDockState, "background">;
  intervalMs?: number;
  schedule?: (callback: () => void, intervalMs: number) => () => void;
}): { dispose(): void } {
  let cancelTimer: (() => void) | undefined;
  const stopTimer = (): void => {
    cancelTimer?.();
    cancelTimer = undefined;
  };
  const refresh = (): void => {
    if (!input.controller.getState().dock.background) return stopTimer();
    input.controller.updateDock(input.readLiveDock());
  };
  const startTimer = (): void => {
    if (cancelTimer) return;
    const schedule = input.schedule ?? ((callback, intervalMs) => {
      const timer = setInterval(callback, intervalMs);
      return () => clearInterval(timer);
    });
    cancelTimer = schedule(refresh, input.intervalMs ?? EXECUTION_DOCK_POLL_INTERVAL_MS);
    refresh();
  };
  const unsubscribe = input.controller.subscribe(() => {
    if (input.controller.getState().dock.background) startTimer();
    else stopTimer();
  });
  return { dispose() { unsubscribe(); stopTimer(); } };
}
