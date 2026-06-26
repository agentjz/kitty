import { truncateText } from "../../../utils/fs.js";
import type { ToolOutputSource } from "../types.js";
import { buildHeader, splitOutputLines } from "./shared.js";

const DIFF_MAX_FILES = 24;

export function buildGitDiffProjection(source: ToolOutputSource): string {
  const lines = splitOutputLines(source.output);
  const files = lines
    .filter((line) => line.startsWith("diff --git "))
    .map((line) => line.replace(/^diff --git a\//, "").replace(/ b\//, " -> "))
    .slice(0, DIFF_MAX_FILES);
  const stats = lines
    .filter((line) => /(\d+ files? changed|\d+ insertions?\(\+\)|\d+ deletions?\(-\))/.test(line))
    .slice(0, 8);
  const hunks = lines
    .filter((line) => line.startsWith("@@") || line.startsWith("+++ ") || line.startsWith("--- "))
    .slice(0, 18)
    .map((line) => truncateText(line, 220));

  return [
    buildHeader(source, "git diff"),
    files.length > 0 ? `files: ${files.join(", ")}` : undefined,
    ...stats,
    ...hunks,
  ].filter((line): line is string => Boolean(line)).join("\n");
}
