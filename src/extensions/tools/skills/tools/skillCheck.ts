import { execa } from "execa";

import { jsonResult } from "../../../shared.js";
import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const skillCheckTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "skill_check",
      description: "Check declared command dependencies for one project runtime skill package.",
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
      throw new Error(`Unknown skill "${name}".`);
    }

    const dependencies = await Promise.all(skill.dependencies.map(async (dependency) => {
      const available = await commandExists(dependency.command, context.cwd);
      return {
        command: dependency.command,
        available,
      };
    }));

    return jsonResult({
      ok: dependencies.every((dependency) => dependency.available),
      skill: {
        name: skill.name,
        path: skill.path,
      },
      dependencies,
    });
  },
};

async function commandExists(command: string, cwd: string): Promise<boolean> {
  const result = await execa(command, ["--version"], {
    cwd,
    all: true,
    reject: false,
    windowsHide: true,
    timeout: 5_000,
  }).catch(() => ({ exitCode: 1 }));
  return result.exitCode === 0;
}
