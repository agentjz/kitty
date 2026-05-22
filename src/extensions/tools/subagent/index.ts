import { subagentCheckTool } from "./tools/subagentCheck.js";
import { subagentLaunchTool } from "./tools/subagentLaunch.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createSubagentTools(): RegisteredTool[] {
  return [
    subagentLaunchTool,
    subagentCheckTool,
  ];
}
