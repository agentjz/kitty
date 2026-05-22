import { TeamStore } from "../../../../team/store.js";
import { okResult, parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const teamListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "team_list",
      description: "List registered teammates.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    parseArgs(rawArgs || "{}");
    return okResult(JSON.stringify({
      members: new TeamStore(context.projectContext.stateRootDir).listMembers(),
    }, null, 2));
  },
};
