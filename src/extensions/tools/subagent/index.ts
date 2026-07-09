import { subagentCancelTool } from "./tools/subagentCancel.js";
import { subagentCheckTool } from "./tools/subagentCheck.js";
import { subagentLaunchTool } from "./tools/subagentLaunch.js";
import { subagentReadTool } from "./tools/subagentRead.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createSubagentTools(): RegisteredTool[] {
  return [
    subagentLaunchTool,
    subagentCheckTool,
    subagentReadTool,
    subagentCancelTool,
  ];
}
