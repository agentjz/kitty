import { jsonResult } from "../../../shared.js";
import { buildSkillSummary } from "../../../../skills/loading.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const skillListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "skill_list",
      description: "List project runtime skills discovered only from the current working directory's skills/**/SKILL.md tree without loading full skill bodies.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    return jsonResult({
      ok: true,
      skills: context.projectContext.skills.map(buildSkillSummary),
      total: context.projectContext.skills.length,
    });
  },
};
