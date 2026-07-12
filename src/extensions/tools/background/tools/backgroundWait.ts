import { waitForBackgroundExecution } from "../../../../execution/background.js";
import { summarizeExecution } from "../../../../runtime/executionSummary.js";
import { clampNumber, okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const backgroundWaitTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "background_wait",
      description: "Wait for a recorded background execution to settle and return its latest lifecycle facts.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          timeout_ms: { type: "number" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const id = readString(args.id, "id");
    const execution = await waitForBackgroundExecution({
      rootDir: context.projectContext.stateRootDir,
      id,
      ownerSessionId: context.ownerSessionId,
      timeoutMs: clampNumber(args.timeout_ms, 0, 86_400_000, 60_000),
    });
    return okResult(JSON.stringify({
      execution: summarizeExecution(execution),
    }, null, 2));
  },
};
