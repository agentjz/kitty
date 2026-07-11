import { truncateText } from "../../../utils/fs.js";
import type { ToolOutputSource } from "../types.js";
import { buildHeader, selectHeadTail, splitOutputLines } from "./shared.js";

const DIFF_MAX_FILES = 24;

export function buildGitDiffProjection(source: ToolOutputSource): string {
  const lines = splitOutputLines(source.output);
  const files = lines
    .filter((line) => line.startsWith("diff --git "))
    .map((line) => line.replace(/^diff --git a\//, "").replace(/ b\//, " -> "));
  const stats = selectHeadTail(
    lines.filter((line) => /(\d+ files? changed|\d+ insertions?\(\+\)|\d+ deletions?\(-\))/.test(line)),
    8,
  );
  const hunks = selectHeadTail(
    lines.filter((line) => line.startsWith("@@") || line.startsWith("+++ ") || line.startsWith("--- ")),
    18,
  )
    .map((line) => truncateText(line, 220));

  return [
    buildHeader(source, "git diff"),
    files.length > 0 ? `files: ${selectHeadTail(files, DIFF_MAX_FILES).join(", ")}` : undefined,
    ...stats,
    ...hunks,
  ].filter((line): line is string => Boolean(line)).join("\n");
}
