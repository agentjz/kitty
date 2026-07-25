import fs from "node:fs/promises";
import path from "node:path";

import { jsonResult } from "../../../shared.js";
import { parseArgs, readString } from "../../../../tools/core/shared.js";
import { truncateText } from "../../../../utils/fs.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

const MAX_RESOURCE_CHARS = 24_000;

export const skillReadResourceTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "skill_read_resource",
      description: "Read one declared resource file from a project runtime skill package.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Exact skill name from skill_list or the available skills runtime facts.",
          },
          path: {
            type: "string",
            description: "Resource path from the selected skill summary.",
          },
        },
        required: ["name", "path"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const name = readString(args.name, "name").trim();
    const requestedPath = readString(args.path, "path").trim();
    const skill = context.projectContext.skills.find((item) => item.name === name);
    if (!skill) {
      throw new Error(`Unknown skill "${name}".`);
    }

    const resource = skill.resources.find((item) => normalizeResourcePath(item.path) === normalizeResourcePath(requestedPath));
    if (!resource) {
      throw new Error(`Skill "${name}" does not declare resource: ${requestedPath}`);
    }

    const absolutePath = path.resolve(context.projectContext.rootDir, resource.path);
    const content = await fs.readFile(absolutePath, "utf8");
    return jsonResult({
      ok: true,
      skill: {
        name: skill.name,
        path: skill.path,
      },
      resource,
      content: truncateText(content, MAX_RESOURCE_CHARS),
      truncated: content.length > MAX_RESOURCE_CHARS,
    });
  },
};

function normalizeResourcePath(value: string): string {
  return value.replace(/\\/g, "/");
}
