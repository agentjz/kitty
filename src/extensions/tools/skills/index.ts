import { skillCheckTool } from "./tools/skillCheck.js";
import { skillListTool } from "./tools/skillList.js";
import { skillLoadTool } from "./tools/skillLoad.js";
import { skillReadResourceTool } from "./tools/skillReadResource.js";
import { skillRunScriptTool } from "./tools/skillRunScript.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createSkillTools(): RegisteredTool[] {
  return [
    skillListTool,
    skillLoadTool,
    skillReadResourceTool,
    skillRunScriptTool,
    skillCheckTool,
  ];
}
