import { backgroundCheckTool } from "./tools/backgroundCheck.js";
import { backgroundRunTool } from "./tools/backgroundRun.js";
import { backgroundTerminateTool } from "./tools/backgroundTerminate.js";
import type { RegisteredTool } from "../../../tools/core/types.js";

export function createBackgroundTools(): RegisteredTool[] {
  return [
    backgroundRunTool,
    backgroundCheckTool,
    backgroundTerminateTool,
  ];
}
