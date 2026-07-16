import { waitForBackgroundExecutionChange } from "../../../../execution/backgroundWait.js";
import { summarizeExecution } from "../../../../runtime/executionSummary.js";
import { clampNumber, okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const backgroundWaitTool: RegisteredTool = {
  effect: "read",
  parallelSafe: false,
  definition: {
    type: "function",
    function: {
      name: "background_wait",
      description: "Wait for progress, settlement, user steering, or an explicit quiet timeout on a background execution.",
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
    const waited = await waitForBackgroundExecutionChange({
      rootDir: context.projectContext.stateRootDir,
      id,
      ownerSessionId: context.ownerSessionId,
      turnId: context.turnId,
      timeoutMs: clampNumber(args.timeout_ms, 0, 86_400_000, 60_000),
      abortSignal: context.abortSignal,
    });
    return okResult(JSON.stringify({
      wait: {
        reason: waited.reason,
        changed: waited.changed,
        waitedMs: waited.waitedMs,
      },
      execution: summarizeExecution(waited.execution),
    }, null, 2));
  },
};
