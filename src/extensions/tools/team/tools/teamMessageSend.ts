import { TeamStore } from "../../../../team/store.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const teamMessageSendTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "team_message_send",
      description: "Send a message to a teammate or lead inbox.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          message: { type: "string" },
        },
        required: ["to", "message"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const message = new TeamStore(context.projectContext.stateRootDir).sendMessage({
      from: context.identity.name,
      to: readString(args.to, "to"),
      message: readString(args.message, "message"),
    });
    return okResult(JSON.stringify({ message }, null, 2));
  },
};
