import { ControlPlaneLedger } from "../../../control/ledger.js";
import type { SpecState } from "../../../spec/types.js";
import type { ToolContext } from "../../../tools/core/types.js";

export function recordSpecLifecycle(context: ToolContext, state: SpecState, reason: string): void {
  const ledger = new ControlPlaneLedger(context.projectContext.stateRootDir);
  try {
    const current = ledger.taskLifecycle.loadCurrent(context.sessionId);
    ledger.taskLifecycle.update({
      sessionId: context.sessionId,
      stage: state.status === "archived" || state.status === "abandoned" ? "completed" : "spec_work",
      activeSpecId: state.id,
      reason,
      activeTodoIds: Object.values(state.tasks)
        .filter((task) => task.status === "pending" || task.status === "in_progress")
        .map((task) => task.id),
      verificationFacts: [
        ...(current?.verificationFacts ?? []),
        `spec ${state.id}: ${state.stage}/${state.status}`,
      ],
      completionFacts: state.status === "archived" || state.status === "abandoned"
        ? [`spec ${state.id}: ${state.status}`]
        : current?.completionFacts,
    });
  } finally {
    ledger.close();
  }
}
