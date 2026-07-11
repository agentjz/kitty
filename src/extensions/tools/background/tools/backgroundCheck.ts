import { BackgroundExecutionStore, reconcileBackgroundExecutions } from "../../../../execution/background.js";
import { summarizeExecutionSet } from "../../../../runtime/executionSummary.js";
import { okResult, parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const backgroundCheckTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "background_check",
      description: "List background executions and reconcile stale running processes.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    parseArgs(rawArgs || "{}");
    const reconcile = reconcileBackgroundExecutions(context.projectContext.stateRootDir);
    const jobs = new BackgroundExecutionStore(context.projectContext.stateRootDir).listAll();
    const summary = summarizeExecutionSet(jobs);
    return okResult(JSON.stringify({
      lost: reconcile.lostExecutions.map((item) => item.id),
      total: summary.total,
      active: summary.active,
      recent: summary.recent,
    }, null, 2));
  },
};
