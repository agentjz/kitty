import { ExecutionStore } from "../../../../execution/store.js";
import { summarizeExecutionSet } from "../../../../runtime/executionSummary.js";
import { okResult, parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const subagentCheckTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "subagent_check",
      description: "List recorded subagent executions.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    parseArgs(rawArgs || "{}");
    const executions = new ExecutionStore(context.projectContext.stateRootDir).list({ kind: "subagent" });
    const summary = summarizeExecutionSet(executions);
    return okResult(JSON.stringify({
      total: summary.total,
      active: summary.active,
      recent: summary.recent,
    }, null, 2));
  },
};
