import { BackgroundExecutionStore, reconcileBackgroundExecutions } from "../../../../execution/background.js";
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
    return okResult(JSON.stringify({
      stale: reconcile.staleExecutions.map((item) => item.id),
      jobs,
    }, null, 2));
  },
};
