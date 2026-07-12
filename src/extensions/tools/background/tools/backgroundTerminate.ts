import { terminateBackgroundExecution, waitForRegisteredBackgroundProcess } from "../../../../execution/background.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const backgroundTerminateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "background_terminate",
      description: "Terminate a recorded background execution and close its lifecycle.",
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
      id: execution.id,
      status: execution.status,
      pid: execution.pid,
    }, null, 2));
  },
};
