import { readExecutionOutput } from "../../../../execution/lifecycle.js";
import { clampNumber, okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const subagentReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "subagent_read",
      description: "Read recorded subagent execution output by summary, tail, or full mode.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          mode: { type: "string", enum: ["summary", "tail", "full"] },
          lines: { type: "number" },
          max_chars: { type: "number" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const output = readExecutionOutput({
      rootDir: context.projectContext.stateRootDir,
      id: readString(args.id, "id"),
      kind: "subagent",
      mode: readOutputMode(args.mode),
      lines: clampNumber(args.lines, 1, 10_000, 80),
      maxChars: clampNumber(args.max_chars, 1, 1_000_000, 20_000),
    });
    return okResult(JSON.stringify(output, null, 2));
  },
};

function readOutputMode(value: unknown): "summary" | "tail" | "full" | undefined {
  return value === "summary" || value === "tail" || value === "full" ? value : undefined;
}
