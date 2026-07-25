import type { RegisteredTool } from "../../../tools/core/types.js";
import { scheduleCreateTool } from "./tools/scheduleCreate.js";
import { scheduleDeleteTool } from "./tools/scheduleDelete.js";
import { scheduleListTool } from "./tools/scheduleList.js";
import { scheduleUpdateTool } from "./tools/scheduleUpdate.js";

export function createSchedulerTools(): RegisteredTool[] {
  return [scheduleCreateTool, scheduleListTool, scheduleUpdateTool, scheduleDeleteTool];
}
