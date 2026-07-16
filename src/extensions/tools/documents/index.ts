import type { RegisteredTool } from "../../../tools/core/types.js";

import { documentReadTool } from "./tools/documentRead.js";
import { documentWriteTool } from "./tools/documentWrite.js";

export function createDocumentTools(): RegisteredTool[] {
  return [documentReadTool, documentWriteTool];
}
