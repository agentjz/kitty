import type { ToolOutputSource } from "../types.js";
import { buildHeader, dedupeProjectedLines, selectHeadTail, splitOutputLines } from "./shared.js";

const STRUCTURED_MAX_LINES = 28;

export function buildDiagnosticProjection(source: ToolOutputSource, label: string): string {
  const lines = splitOutputLines(source.output);
  const evidence = selectHeadTail(lines.filter(isDiagnosticEvidenceLine), STRUCTURED_MAX_LINES);
  const summaryLines = selectHeadTail(lines.filter(isSummaryLine), 8);

  return dedupeProjectedLines([
    buildHeader(source, label),
    ...summaryLines,
    ...evidence,
  ]).join("\n");
}

function isDiagnosticEvidenceLine(line: string): boolean {
  return /(^|\b)(error|warning|fail|failed|failure|panic|exception|traceback|expected|received|cannot find|not assignable|mismatched|undefined|denied)(\b|:)/i.test(line) ||
    /^\s*(at\s|file\s|src\/|tests?\/|[A-Za-z]:\\|\.\/)/.test(line) ||
    /\(\d+,\d+\):\s+(error|warning)\s+/i.test(line) ||
    /error\[e\d+\]/i.test(line);
}

function isSummaryLine(line: string): boolean {
  return /\b(\d+\s+(passed|failed|skipped|errors?|warnings?)|test result|found \d+ errors?|failed tests?|build failed|compiled successfully)\b/i.test(line);
}
