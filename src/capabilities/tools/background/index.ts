import { backgroundCheckTool } from "./tools/backgroundCheck.js";
import { backgroundReadTool } from "./tools/backgroundRead.js";
import { backgroundRunTool } from "./tools/backgroundRun.js";
import { backgroundStopTool } from "./tools/backgroundStop.js";
import { backgroundTerminateTool } from "./tools/backgroundTerminate.js";
import { backgroundWaitTool } from "./tools/backgroundWait.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createBackgroundTools(): RegisteredTool[] {
  return [
    backgroundRunTool,
    backgroundCheckTool,
    backgroundReadTool,
    backgroundWaitTool,
    backgroundStopTool,
    backgroundTerminateTool,
  ];
}
