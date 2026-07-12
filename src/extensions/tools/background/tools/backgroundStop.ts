import { terminateBackgroundExecution, waitForRegisteredBackgroundProcess } from "../../../../execution/background.js";
import { summarizeExecution } from "../../../../runtime/executionSummary.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const backgroundStopTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "background_stop",
      description: "Stop a recorded background execution and return its final lifecycle facts.",
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
    const id = readString(args.id, "id");
    const execution = terminateBackgroundExecution(context.projectContext.stateRootDir, id, context.ownerSessionId);
    await waitForRegisteredBackgroundProcess(id);
    return okResult(JSON.stringify({
      execution: summarizeExecution(execution),
    }, null, 2));
  },
};
