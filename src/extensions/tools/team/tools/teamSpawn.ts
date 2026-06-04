import { TeamStore } from "../../../../team/store.js";
import { clampNumber, okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const teamSpawnTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "team_spawn",
      description: "Spawn a teammate execution and register the teammate.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          objective: { type: "string" },
          boundary: { type: "string" },
          expected_output: { type: "string" },
          prompt: { type: "string" },
          timeout_ms: { type: "number" },
        },
        required: ["name", "role", "prompt"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const result = new TeamStore(context.projectContext.stateRootDir).spawnMember({
      name: readString(args.name, "name"),
      role: readString(args.role, "role"),
      objective: typeof args.objective === "string" ? args.objective : undefined,
      boundary: typeof args.boundary === "string" ? args.boundary : undefined,
      expectedOutput: typeof args.expected_output === "string" ? args.expected_output : undefined,
      prompt: readString(args.prompt, "prompt"),
      cwd: context.cwd,
      requestedBy: context.identity.name,
      config: context.config,
      timeoutMs: clampNumber(args.timeout_ms, 1_000, 86_400_000, 600_000),
    });
    return okResult(JSON.stringify({
      member: result.member,
      executionId: result.execution.id,
      assignment: result.execution.assignment,
      status: result.execution.status,
      deadlineAt: result.execution.deadlineAt,
    }, null, 2));
  },
};
