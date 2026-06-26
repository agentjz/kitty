import { truncateText } from "../../../utils/fs.js";
import type { ToolOutputSource } from "../types.js";

export function buildHeader(source: ToolOutputSource, label: string): string {
  return [
    `${source.toolName}: ${label}`,
    source.exitCode === undefined ? undefined : `exit=${source.exitCode ?? "null"}`,
    source.durationMs === undefined ? undefined : `duration=${source.durationMs}ms`,
    source.status ? `status=${source.status}` : undefined,
  ].filter(Boolean).join("  ");
}

export function splitOutputLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trimEnd());
}

export function dedupeProjectedLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawLine of lines) {
    const line = truncateText(rawLine.trim(), 260);
    if (!line || seen.has(line)) {
      continue;
    }
    seen.add(line);
    result.push(line);
  }
  return result;
}
