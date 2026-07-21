import type { ToolExecutionResult } from "../../types.js";
export function projectToolResultForModel(input: {
  toolName: string;
  result: ToolExecutionResult;
}): string {
  const projection = projectRawToolResultForModel(input);
  if (projection.trim()) {
    return projection;
  }
  return input.result.ok
    ? `${input.toolName} completed without text output.`
    : `${input.toolName} failed without error detail.`;
}

function projectRawToolResultForModel(input: {
  toolName: string;
  result: ToolExecutionResult;
}): string {
  if (input.result.metadata?.outputGovernance) {
    return input.result.metadata.outputGovernance.projection;
  }

  const parsed = parseObject(input.result.output);
  if (!input.result.ok) {
    return projectFailure(input.toolName, input.result.output, parsed);
  }

  if (!parsed) {
    return input.result.output.trim();
  }

  switch (input.toolName) {
    case "read":
      return projectRead(parsed);
    case "document_read":
      return projectDocumentRead(parsed);
    case "edit":
      return projectEdit(parsed);
    case "write":
      return projectWrite(parsed);
    case "document_write":
      return projectDocumentWrite(parsed);
    case "bash":
      return projectBash(parsed);
    case "background_check":
      return projectExecutionCheck(parsed);
    case "background_read":
      return projectExecutionRead(parsed);
    case "background_run":
    case "background_wait":
    case "background_stop":
    case "background_terminate":
      return projectExecutionAction(parsed);
    case "skill_load":
      return projectSkillLoad(parsed);
    default:
      return projectGenericSuccess(input.toolName, input.result.output);
  }
}

function projectDocumentRead(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "document";
  const start = readNumber(payload.startUnit);
  const end = readNumber(payload.endUnit);
  const unit = readString(payload.unit) ?? "unit";
  const continuationArgs = readObject(readObject(payload.continuation)?.continuationArgs);
  const warnings = readArray(payload.warnings)?.filter((warning): warning is string => typeof warning === "string");
  return joinLines([
    `${path}${start !== undefined && end !== undefined ? ` (${unit}s ${start}-${end})` : ""}`,
    readString(payload.content),
    warnings && warnings.length > 0 ? `warnings: ${warnings.join("; ")}` : undefined,
    continuationArgs ? `next: document_read ${JSON.stringify(continuationArgs)}` : undefined,
  ]);
}

function projectDocumentWrite(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "document";
  const bytes = readNumber(payload.bytes);
  return `${payload.existed === true ? "wrote" : "created"} Word document ${path}${bytes === undefined ? "" : ` (${bytes} bytes)`}`;
}

function projectExecutionRead(payload: Record<string, unknown>): string {
  return joinLines([
    readString(payload.id) ?? "execution",
    readString(payload.kind),
    readString(payload.status),
    readString(payload.mode) ? `mode: ${readString(payload.mode)}` : undefined,
    readNumber(payload.bytes) !== undefined ? `bytes: ${readNumber(payload.bytes)}` : undefined,
    payload.truncated === true ? "output truncated" : undefined,
    readString(payload.output),
  ]);
}

function projectExecutionAction(payload: Record<string, unknown>): string {
  const execution = readObject(payload.execution) ?? payload;
  const wait = readObject(payload.wait);
  return joinLines([
    wait && readString(wait.reason) ? `wait: ${readString(wait.reason)}` : undefined,
    wait && readNumber(wait.waitedMs) !== undefined ? `waited: ${readNumber(wait.waitedMs)}ms` : undefined,
    readString(execution.id) ?? "execution",
    readString(execution.kind),
    readString(execution.status),
    readString(execution.command),
    readString(execution.summary),
    readString(execution.outputPreview),
    readObject(execution.health) ? readString(readObject(execution.health)?.message) : undefined,
    readString(execution.error),
  ]);
}

function projectExecutionCheck(payload: Record<string, unknown>): string {
  const total = readNumber(payload.total);
  const active = readArray(payload.active) ?? [];
  const recent = readArray(payload.recent) ?? [];
  const stale = readArray(payload.stale) ?? [];
  const entries = [...active, ...recent]
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const parts = [
        readString(item.id) ?? "execution",
        readString(item.kind),
        readString(item.status),
        readString(item.summary),
        readString(item.outputPreview),
        readString(item.error),
      ].filter((part): part is string => Boolean(part));
      return parts.join("  ");
    });

  return joinLines([
    `total: ${total ?? recent.length + active.length}`,
    stale.length > 0 ? `stale: ${stale.map(String).join(", ")}` : undefined,
    ...entries,
  ]);
}

function projectRead(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? readString(payload.requestedPath) ?? "file";
  if (payload.readable === false) {
    return joinLines([
      `${path}: not readable`,
      readString(payload.reason),
      readString(payload.detectedCapability) ? `capability: ${readString(payload.detectedCapability)}` : undefined,
    ]);
  }

  const startLine = readNumber(payload.startLine);
  const endLine = readNumber(payload.endLine);
  const content = readString(payload.content) ?? "";
  const continuation = readObject(payload.continuation);
  const continuationArgs = readObject(continuation?.continuationArgs);

  return joinLines([
    `${path}${startLine && endLine ? `:${startLine}-${endLine}` : ""}`,
    content || "The requested file range is empty.",
    continuationArgs ? `next: read ${JSON.stringify(continuationArgs)}` : undefined,
  ]);
}

function projectEdit(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "file";
  const applied = readNumber(payload.appliedEdits) ?? readNumber(payload.requestedEdits);
  const diff = readString(payload.diff) ?? readString(payload.preview);
  return joinLines([
    `edited ${path}${applied ? ` (${applied} replacement${applied === 1 ? "" : "s"})` : ""}`,
    diff,
  ]);
}

function projectWrite(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "file";
  const bytes = readNumber(payload.bytes);
  const existed = payload.existed === true;
  const diff = readString(payload.diff) ?? readString(payload.preview);
  return joinLines([
    `${existed ? "wrote" : "created"} ${path}${bytes !== undefined ? ` (${bytes} bytes)` : ""}`,
    diff,
  ]);
}

function projectBash(payload: Record<string, unknown>): string {
  const governance = readObject(payload.outputGovernance);
  const projection = readString(governance?.projection);
  if (projection) {
    return projection;
  }

  const exitCode = readNumber(payload.exitCode);
  const durationMs = readNumber(payload.durationMs);
  const status = readString(payload.status);
  const output = readString(payload.output);
  const lines = [
    `exit ${exitCode ?? "?"}${durationMs !== undefined ? ` in ${durationMs}ms` : ""}${status && status !== "completed" ? ` (${status})` : ""}`,
  ];
  if (output?.trim()) {
    lines.push(output.trim());
  }
  if (payload.truncated === true) {
    lines.push("output truncated");
  }
  return joinLines(lines);
}

function projectSkillLoad(payload: Record<string, unknown>): string {
  const skill = readObject(payload.skill);
  const name = readString(skill?.name) ?? "skill";
  const description = readString(skill?.description);
  const path = readString(skill?.path);
  const body = readString(payload.body) ?? "";
  return joinLines([
    `loaded skill: ${name}${path ? ` (${path})` : ""}`,
    description,
    body,
  ]);
}

function projectGenericSuccess(toolName: string, rawOutput: string): string {
  return `${toolName} completed successfully and returned these facts:\n${rawOutput.trim() || "No additional result fields."}`;
}

function projectFailure(toolName: string, rawOutput: string, payload: Record<string, unknown> | null): string {
  if (!payload) {
    return rawOutput.trim();
  }

  const details = readObject(payload.details);
  const readArgs = readObject(details?.readArgs);
  const suggestions = readArray(details?.suggestions);
  const lines = [
    `${toolName} failed: ${readString(payload.error) ?? "unknown error"}`,
    readString(payload.code) ? `code: ${readString(payload.code)}` : undefined,
    readString(payload.hint) ? `hint: ${readString(payload.hint)}` : undefined,
    readArgs ? `read: read ${JSON.stringify(readArgs)}` : undefined,
    suggestions && suggestions.length > 0 ? `suggestions: ${suggestions.map((item) => String(item)).join(", ")}` : undefined,
  ];

  return joinLines(lines);
}

function joinLines(lines: Array<string | undefined>): string {
  return lines
    .map((line) => line?.trimEnd())
    .filter((line): line is string => Boolean(line && line.length > 0))
    .join("\n");
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}
