import { cancelExecution } from "../../../../execution/lifecycle.js";
import { summarizeExecution } from "../../../../runtime/executionSummary.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const subagentCancelTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "subagent_cancel",
      description: "Cancel a recorded subagent execution and publish lifecycle wake facts.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const execution = cancelExecution(context.projectContext.stateRootDir, readString(args.id, "id"), {
      expectedKind: "subagent",
      terminatedBy: context.identity.name,
    });
    return okResult(JSON.stringify({
      execution: summarizeExecution(execution),
    }, null, 2));
  },
};
