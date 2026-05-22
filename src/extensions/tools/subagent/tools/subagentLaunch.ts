import { launchSubagentExecution } from "../../../../subagent/launch.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const subagentLaunchTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "subagent_launch",
      description: "Launch a focused subagent execution and record it in the control plane.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string" },
          boundary: { type: "string" },
          expected_output: { type: "string" },
          prompt: { type: "string" },
          role: { type: "string" },
        },
        required: ["objective", "prompt", "role"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const execution = launchSubagentExecution({
      rootDir: context.projectContext.stateRootDir,
      cwd: context.cwd,
      requestedBy: context.identity.name,
      objective: readString(args.objective, "objective"),
      boundary: typeof args.boundary === "string" ? args.boundary : undefined,
      expectedOutput: typeof args.expected_output === "string" ? args.expected_output : undefined,
      prompt: readString(args.prompt, "prompt"),
      role: readString(args.role, "role"),
      config: context.config,
    });
    return okResult(JSON.stringify({
      id: execution.id,
      status: execution.status,
      actorName: execution.actorName,
      actorRole: execution.actorRole,
      assignment: execution.assignment,
      pid: execution.pid,
    }, null, 2));
  },
};
