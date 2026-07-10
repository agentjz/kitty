import { reconcileExecutions } from "../../execution/lifecycle.js";
import { ExecutionStore } from "../../execution/store.js";
import type { TuiController } from "./controller.js";
import type { TuiRuntimeDockState } from "./store.js";

const EXECUTION_DOCK_POLL_INTERVAL_MS = 250;

interface TuiExecutionDockFact {
  kind: string;
  status: string;
  summary?: string;
  risk?: "none" | "watch" | "blocked";
}

export function projectTuiExecutionDockFacts(
  executions: readonly TuiExecutionDockFact[],
): Pick<TuiRuntimeDockState, "background" | "subagent"> {
  return {
    background: formatExecutionDockFact(executions, "background"),
    subagent: formatExecutionDockFact(executions, "subagent"),
  };
}

export function readTuiLiveExecutionDock(input: {
  rootDir: string;
  cwd: string;
}): Pick<TuiRuntimeDockState, "background" | "subagent"> {
  reconcileExecutions(input.rootDir, { kinds: ["background", "subagent"] });
  const executions = new ExecutionStore(input.rootDir)
    .list({
      kinds: ["background", "subagent"],
      statuses: ["created", "running"],
      cwd: input.cwd,
    })
    .map((execution) => ({
      kind: execution.kind,
      status: execution.status,
      summary: execution.assignment?.objective ?? execution.summary ?? execution.command,
    }));
  return projectTuiExecutionDockFacts(executions);
}

export function createTuiExecutionDockWatcher(input: {
  controller: TuiController;
  readLiveDock: () => Pick<TuiRuntimeDockState, "background" | "subagent">;
  intervalMs?: number;
  schedule?: (callback: () => void, intervalMs: number) => () => void;
}): { dispose(): void } {
  let cancelTimer: (() => void) | undefined;
  const refresh = (): void => {
    if (!hasLiveExecutionLane(input.controller.getState().dock)) {
      stopTimer();
      return;
    }
    input.controller.updateDock(input.readLiveDock());
  };
  const startTimer = (): void => {
    if (cancelTimer) {
      return;
    }
    const schedule = input.schedule ?? ((callback, intervalMs) => {
      const timer = setInterval(callback, intervalMs);
      return () => clearInterval(timer);
    });
    cancelTimer = schedule(refresh, input.intervalMs ?? EXECUTION_DOCK_POLL_INTERVAL_MS);
    refresh();
  };
  const stopTimer = (): void => {
    cancelTimer?.();
    cancelTimer = undefined;
  };
  const unsubscribe = input.controller.subscribe(() => {
    if (hasLiveExecutionLane(input.controller.getState().dock)) {
      startTimer();
    } else {
      stopTimer();
    }
  });

  return {
    dispose() {
      unsubscribe();
      stopTimer();
    },
  };
}

function hasLiveExecutionLane(dock: TuiRuntimeDockState): boolean {
  return Boolean(dock.background || dock.subagent);
}

function formatExecutionDockFact(
  executions: readonly TuiExecutionDockFact[],
  kind: "background" | "subagent",
): string | undefined {
  const active = executions.filter((execution) => (
    execution.kind === kind
      && (execution.status === "created" || execution.status === "running")
  ));
  if (active.length === 0) {
    return undefined;
  }
  const attention = active.filter((execution) => execution.risk && execution.risk !== "none").length;
  const first = active[0];
  return [
    `${active.length} ${first?.status ?? "active"}`,
    attention > 0 ? `${attention} attention` : undefined,
    first?.summary ? truncateDockFact(first.summary, 48) : undefined,
  ].filter(Boolean).join("; ");
}

function truncateDockFact(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}
