import type { RegisteredTool } from "../tools/core/types.js";
import { createWebDownloadTool } from "./webDownload.js";
import { createWebFetchTool } from "./webFetch.js";
import { createWebSearchTool } from "./webSearch.js";
import type { WebDependencies } from "./webShared.js";

export type { WebDependencies } from "./webShared.js";
export { createWebDownloadTool } from "./webDownload.js";
export { createWebFetchTool } from "./webFetch.js";
export { createWebSearchTool } from "./webSearch.js";

export function createWebTools(dependencies: WebDependencies = {}): readonly RegisteredTool[] {
  return [
    createWebSearchTool(dependencies),
    createWebFetchTool(dependencies),
    createWebDownloadTool(dependencies),
  ];
}
