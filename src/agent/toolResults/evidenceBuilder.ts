import path from "node:path";

import { truncateText } from "../../utils/fs.js";
import type {
  ToolExecutionResult,
  ToolResultArtifact,
  ToolResultEnvelope,
  ToolResultFactValue,
  ToolResultProvenance,
} from "../../types.js";
import { projectToolResultForModel } from "./modelProjection.js";

const COMPACT_MAX_CHARS = 1_200;

export function buildToolResultEnvelope(input: {
  callId: string;
  toolName: string;
  rawArguments: string;
  cwd: string;
  result: ToolExecutionResult;
}): ToolResultEnvelope {
  const modelView = projectToolResultForModel(input);
  const payload = parseObject(input.result.output);
  const args = parseObject(input.rawArguments);
  const governance = input.result.metadata?.outputGovernance;
  const provenance = buildProvenance(input.cwd, payload, args);
  const facts = buildFacts(input.result, payload, input.cwd);
  const artifacts = buildArtifacts(payload, governance, input.cwd);
  const error = input.result.ok
    ? undefined
    : buildErrorEvidence(payload, input.result.output, governance?.recoveryHint);
  const summary = buildSummary(input.toolName, input.result.ok, modelView, error?.message);
  const compactView = buildCompactView({
    toolName: input.toolName,
    status: input.result.ok ? "success" : "error",
    summary,
    provenance,
    facts,
    error,
    artifacts,
  });
  const originalChars = governance?.rawChars ?? input.result.output.length;
  const projectedChars = modelView.length;
  const truncated = Boolean(governance?.truncated || artifacts.some((artifact) => artifact.kind === "command_output"));

  return {
    callId: input.callId,
    toolName: input.toolName,
    status: input.result.ok ? "success" : "error",
    summary,
    modelView,
    compactView,
    provenance,
    facts,
    error,
    artifacts,
    truncation: {
      truncated,
      strategy: truncated
        ? governance?.mode === "structured" ? "structured" : "artifact"
        : "none",
      originalChars,
      projectedChars,
      omittedChars: truncated ? Math.max(0, originalChars - projectedChars) : undefined,
    },
  };
}

function buildProvenance(
  cwd: string,
  payload: Record<string, unknown> | null,
  args: Record<string, unknown> | null,
): ToolResultProvenance | undefined {
  const targetPath = firstString(payload?.path, payload?.requestedPath, args?.path, args?.filePath);
  const command = firstString(payload?.command, args?.command);
  const executionId = firstString(payload?.id, payload?.jobId, payload?.taskId);
  const provenance: ToolResultProvenance = {
    cwd: command ? normalizePathForModel(cwd, cwd) : undefined,
    command,
    targetPath: targetPath ? normalizePathForModel(targetPath, cwd) : undefined,
    startLine: readNumber(payload?.startLine),
    endLine: readNumber(payload?.endLine),
    executionId,
  };
  return Object.values(provenance).some((value) => value !== undefined) ? provenance : undefined;
}

function buildFacts(
  result: ToolExecutionResult,
  payload: Record<string, unknown> | null,
  cwd: string,
): Record<string, ToolResultFactValue> {
  const candidates: Record<string, unknown> = {
    exitCode: payload?.exitCode ?? result.metadata?.runtime?.exitCode,
    durationMs: payload?.durationMs ?? result.metadata?.runtime?.durationMs,
    runtimeStatus: payload?.status ?? result.metadata?.runtime?.status,
    appliedEdits: payload?.appliedEdits,
    requestedEdits: payload?.requestedEdits,
    bytes: payload?.bytes,
    totalLines: payload?.totalLines,
    matches: Array.isArray(payload?.matches) ? payload.matches.length : payload?.matches,
    total: payload?.total,
    beforeHash: payload?.beforeHash,
    afterHash: payload?.afterHash,
    changedPaths: result.metadata?.changedPaths?.map((changedPath) => normalizePathForModel(changedPath, cwd)),
  };
  return Object.fromEntries(
    Object.entries(candidates).filter((entry): entry is [string, ToolResultFactValue] => isFactValue(entry[1])),
  );
}

function buildArtifacts(
  payload: Record<string, unknown> | null,
  governance: NonNullable<ToolExecutionResult["metadata"]>["outputGovernance"],
  cwd: string,
): ToolResultArtifact[] {
  const outputPath = firstString(governance?.outputPath, payload?.outputPath);
  if (!outputPath) {
    return [];
  }
  const modelPath = normalizePathForModel(outputPath, cwd);
  return [{
    kind: "command_output",
    path: modelPath,
    chars: governance?.rawChars ?? readNumber(payload?.outputChars),
    bytes: readNumber(payload?.outputBytes),
    recovery: {
      tool: "read",
      arguments: { path: modelPath },
    },
  }];
}

function buildErrorEvidence(
  payload: Record<string, unknown> | null,
  rawOutput: string,
  governanceRecoveryHint?: string,
) {
  const runtimeStatus = readString(payload?.status);
  const exitCode = readNumber(payload?.exitCode);
  const runtimeMessage = runtimeStatus
    ? `Command ${runtimeStatus}${exitCode !== undefined ? ` with exit code ${exitCode}` : ""}.`
    : undefined;
  return {
    code: readString(payload?.code),
    message: readString(payload?.error) ?? runtimeMessage ?? (truncateText(rawOutput.trim(), 500) || "Tool failed."),
    recoveryHint: readString(payload?.hint) ?? governanceRecoveryHint,
  };
}

function buildSummary(toolName: string, ok: boolean, modelView: string, errorMessage?: string): string {
  if (!ok && errorMessage) {
    return truncateText(`${toolName} failed: ${oneLine(errorMessage)}`, 320);
  }
  const firstLine = modelView.split(/\r?\n/).find((line) => line.trim().length > 0);
  return truncateText(firstLine?.trim() || `${toolName} ${ok ? "completed" : "failed"}`, 320);
}

function buildCompactView(input: {
  toolName: string;
  status: "success" | "error";
  summary: string;
  provenance?: ToolResultProvenance;
  facts: Record<string, ToolResultFactValue>;
  error?: { code?: string; message: string; recoveryHint?: string };
  artifacts: ToolResultArtifact[];
}): string {
  const target = input.provenance?.targetPath
    ? `target=${input.provenance.targetPath}${input.provenance.startLine && input.provenance.endLine ? `:${input.provenance.startLine}-${input.provenance.endLine}` : ""}`
    : undefined;
  const factLine = Object.entries(input.facts)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : String(value)}`)
    .join("  ");
  const artifact = input.artifacts[0];
  return truncateText(joinLines([
    `${input.toolName}: ${input.status}`,
    input.summary,
    target,
    factLine || undefined,
    input.error ? `error${input.error.code ? ` ${input.error.code}` : ""}: ${oneLine(input.error.message)}` : undefined,
    input.error?.recoveryHint ? `recovery: ${oneLine(input.error.recoveryHint)}` : undefined,
    artifact ? `artifact=${artifact.path}; recover with ${artifact.recovery?.tool} ${JSON.stringify(artifact.recovery?.arguments)}` : undefined,
  ]), COMPACT_MAX_CHARS);
}

function normalizePathForModel(value: string, cwd: string): string {
  const resolved = path.resolve(cwd, value);
  const relative = path.relative(cwd, resolved);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.replace(/\\/g, "/");
  }
  if (!relative) {
    return ".";
  }
  return resolved.replace(/\\/g, "/");
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

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function isFactValue(value: unknown): value is ToolResultFactValue {
  return value === null || typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean" || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function joinLines(lines: Array<string | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
