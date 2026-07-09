import { buildToolCallDisplay, buildToolResultDisplay } from "../../runtime-ui/toolDisplay.js";
import type { RuntimeUiChannel } from "../../runtime-ui/events.js";
import { tryParseJson } from "../../utils/json.js";
import { createFailedActivity, createRunningActivity, type TuiActivity, type TuiActivityKind } from "./activity.js";

export interface TuiToolCallFact {
  readonly activity: TuiActivity;
  readonly background?: string;
  readonly subagent?: string;
}

export interface TuiToolResultFact {
  readonly activity: TuiActivity | undefined;
  readonly background?: string;
  readonly subagent?: string;
  readonly transcript?: string;
}

export function projectTuiToolCallFact(
  name: string,
  rawArgs: string,
  options: { channel?: RuntimeUiChannel; now?: number } = {},
): TuiToolCallFact {
  const summary = buildToolCallDisplay(name, rawArgs, 240).summary;
  const channel = options.channel ?? "lead";
  return {
    activity: createRunningActivity({
      kind: readActivityKind(name, channel),
      channel,
      summary,
      toolName: name,
      blockingLead: channel === "subagent",
      now: options.now,
    }),
    ...projectLiveExecutionFact(name, summary),
  };
}

export function projectTuiToolResultFact(name: string, rawOutput: string): TuiToolResultFact {
  const display = buildToolResultDisplay(name, rawOutput);
  const runningSummary = readRunningSummary(name, rawOutput, display.summary);
  return {
    activity: undefined,
    ...projectLiveExecutionFact(name, runningSummary),
    transcript: name === "todo_write" ? display.preview : undefined,
  };
}

export function projectTuiToolErrorFact(name: string, error: string): TuiToolResultFact {
  const summary = `${name}: ${shorten(error)}`;
  return {
    activity: createFailedActivity({
      kind: readActivityKind(name, "lead"),
      summary,
      toolName: name,
    }),
    ...projectLiveExecutionFact(name, summary),
  };
}

export function projectTuiRuntimeStatusActivity(message: string, channel: RuntimeUiChannel): TuiActivity | undefined {
  const summary = normalizeStatusMessage(message);
  if (!summary) {
    return undefined;
  }
  return createRunningActivity({
    kind: "status",
    channel,
    summary,
    blockingLead: channel === "subagent",
  });
}

function projectLiveExecutionFact(
  name: string,
  value: string | undefined,
): Pick<TuiToolCallFact, "background" | "subagent"> {
  const normalized = name.toLowerCase();
  if (normalized === "background_run") {
    return { background: value };
  }
  if (normalized === "subagent_launch") {
    return { subagent: value };
  }
  return {};
}

function readActivityKind(name: string, channel: RuntimeUiChannel): TuiActivityKind {
  const normalized = name.toLowerCase();
  if (normalized === "background_run") {
    return "background";
  }
  if (channel === "subagent" || normalized === "subagent_launch") {
    return "subagent";
  }
  return "tool";
}

function normalizeStatusMessage(message: string): string | undefined {
  const trimmed = message.trim();
  if (!trimmed) {
    return undefined;
  }
  switch (trimmed) {
    case "Lead yielded. Waiting for delegated execution wake signal.":
      return "等待子代理完成";
    case "Lead resumed after delegated execution settled.":
      return "子代理已完成，切回 lead";
    default:
      return trimmed;
  }
}

function readRunningSummary(name: string, rawOutput: string, fallback: string): string | undefined {
  const parsed = tryParseJson(rawOutput);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const status = (parsed as Record<string, unknown>).status;
  if (status === "running" || status === "created") {
    return `${fallback} ${status}`;
  }
  if (name === "background_run" || name === "subagent_launch") {
    return undefined;
  }
  return undefined;
}

function shorten(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) {
    return normalized;
  }
  return `${normalized.slice(0, 77)}...`;
}
