import { TeamStore } from "../../../../team/store.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
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
          prompt: { type: "string" },
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
      prompt: readString(args.prompt, "prompt"),
      cwd: context.cwd,
      requestedBy: context.identity.name,
      config: context.config,
    });
    return okResult(JSON.stringify({
      member: result.member,
      executionId: result.execution.id,
      status: result.execution.status,
    }, null, 2));
  },
};
