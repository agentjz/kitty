import { TeamStore } from "../../../../team/store.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const teamInboxReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "team_inbox_read",
      description: "Read and clear a teammate or lead inbox.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const messages = new TeamStore(context.projectContext.stateRootDir).readInbox(readString(args.name, "name"));
    return okResult(JSON.stringify({ messages }, null, 2));
  },
};
