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

export function selectHeadTail<T>(values: T[], limit: number): T[] {
  if (values.length <= limit) {
    return values;
  }
  const headCount = Math.ceil(limit / 2);
  const tailCount = Math.floor(limit / 2);
  return [...values.slice(0, headCount), ...values.slice(-tailCount)];
}

export function buildHeadTailPreview(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  const headChars = Math.floor(maxChars * 0.35);
  const tailChars = maxChars - headChars;
  const omitted = trimmed.length - headChars - tailChars;
  return [
    trimmed.slice(0, headChars),
    `... ${omitted} characters omitted ...`,
    trimmed.slice(-tailChars),
  ].join("\n");
}
