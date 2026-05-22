import { buildLoadedSkillPayload } from "../../../../skills/loading.js";
import { jsonResult } from "../../../shared.js";
import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const skillLoadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "skill_load",
      description: "Load the full content of one project runtime skill when the model decides the current task needs that method.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Exact skill name from skill_list or the available skills runtime facts.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const name = readString(args.name, "name").trim();
    const skill = context.projectContext.skills.find((item) => item.name === name);
    if (!skill) {
      const available = context.projectContext.skills.map((item) => item.name);
      throw new Error(
        available.length > 0
          ? `Unknown skill "${name}". Available skills: ${available.join(", ")}.`
          : `Unknown skill "${name}". No project runtime skills are available.`,
      );
    }

    return jsonResult(buildLoadedSkillPayload(skill));
  },
};
