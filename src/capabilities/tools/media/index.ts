import type { RegisteredTool } from "../../../tools/core/types.js";
import { generateImageTool } from "./tools/generateImage.js";
import { generateVideoTool } from "./tools/generateVideo.js";

export function createMediaTools(): readonly RegisteredTool[] {
  return [generateImageTool, generateVideoTool];
}
