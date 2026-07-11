import { truncateText } from "../../../utils/fs.js";
import type { ToolOutputSource } from "../types.js";
import { buildHeader, selectHeadTail, splitOutputLines } from "./shared.js";

const SEARCH_MAX_MATCHES = 24;

export function buildSearchProjection(source: ToolOutputSource): string {
  const nonEmptyLines = splitOutputLines(source.output)
    .filter((line) => line.trim().length > 0);
  const matches = selectHeadTail(nonEmptyLines, SEARCH_MAX_MATCHES)
    .map((line) => truncateText(line, 220));
  const omitted = Math.max(0, nonEmptyLines.length - matches.length);

  return [
    buildHeader(source, "search"),
    `matches shown: ${matches.length}${omitted > 0 ? `, omitted: ${omitted}` : ""}`,
    ...matches,
  ].join("\n");
}
