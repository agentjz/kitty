import { buildToolCallDisplay, buildToolResultDisplay } from "../../runtime-ui/toolDisplay.js";
import { tryParseJson } from "../../utils/json.js";

export interface TuiToolCallFact {
  readonly current: string;
  readonly background?: string;
  readonly subagent?: string;
}

export interface TuiToolResultFact {
  readonly current?: string;
  readonly background?: string;
  readonly subagent?: string;
  readonly transcript?: string;
}

export function projectTuiToolCallFact(name: string, rawArgs: string): TuiToolCallFact {
  const current = buildToolCallDisplay(name, rawArgs, 240).summary;
  return {
    current,
    ...projectLiveExecutionFact(name, current),
  };
}

export function projectTuiToolResultFact(name: string, rawOutput: string): TuiToolResultFact {
  const display = buildToolResultDisplay(name, rawOutput);
  const runningSummary = readRunningSummary(name, rawOutput, display.summary);
  return {
    current: undefined,
    ...projectLiveExecutionFact(name, runningSummary),
    transcript: name === "todo_write" ? display.preview : undefined,
  };
}

export function projectTuiToolErrorFact(name: string, error: string): TuiToolResultFact {
  const current = `${name}: ${shorten(error)}`;
  return {
    current,
    ...projectLiveExecutionFact(name, current),
  };
}

function projectLiveExecutionFact(
  name: string,
  value: string | undefined,
): Pick<TuiToolCallFact, "background" | "subagent"> {
  const normalized = name.toLowerCase();
  if (normalized.includes("background")) {
    return { background: value };
  }
  if (normalized.includes("subagent")) {
    return { subagent: value };
  }
  return {};
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
