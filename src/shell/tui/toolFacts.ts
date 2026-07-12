import { buildToolResultDisplay } from "../../runtime-ui/toolDisplay.js";
import { tryParseJson } from "../../utils/json.js";
import { createFailedActivity, createRunningActivity, type TuiActivity, type TuiActivityKind } from "./activity.js";

export interface TuiToolCallFact {
  readonly activity: TuiActivity;
  readonly background?: string;
}

export interface TuiToolResultFact {
  readonly activity: TuiActivity | undefined;
  readonly background?: string;
  readonly transcript?: string;
}

export function projectTuiToolCallFact(name: string, _rawArgs: string, options: { now?: number } = {}): TuiToolCallFact {
  return {
    activity: createRunningActivity({
      kind: readActivityKind(name),
      summary: name,
      toolName: name,
      now: options.now,
    }),
    ...projectLiveBackgroundFact(name, name),
  };
}

export function projectTuiToolResultFact(name: string, rawOutput: string): TuiToolResultFact {
  const display = buildToolResultDisplay(name, rawOutput);
  return {
    activity: undefined,
    ...projectLiveBackgroundFact(name, readRunningSummary(name, rawOutput)),
    transcript: name === "todo_write" ? display.preview : undefined,
  };
}

export function projectTuiToolErrorFact(name: string, _error: string): TuiToolResultFact {
  return {
    activity: createFailedActivity({ kind: readActivityKind(name), summary: name, toolName: name }),
    ...projectLiveBackgroundFact(name, name),
  };
}

export function projectTuiRuntimeStatusActivity(message: string): TuiActivity | undefined {
  const summary = message.trim();
  return summary ? createRunningActivity({ kind: "status", summary }) : undefined;
}

function projectLiveBackgroundFact(name: string, value: string | undefined): Pick<TuiToolCallFact, "background"> {
  return name.toLowerCase() === "background_run" ? { background: value } : {};
}

function readActivityKind(name: string): TuiActivityKind {
  return name.toLowerCase() === "background_run" ? "background" : "tool";
}

function readRunningSummary(name: string, rawOutput: string): string | undefined {
  const parsed = tryParseJson(rawOutput);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const status = (parsed as Record<string, unknown>).status;
  return status === "running" || status === "created" ? name : undefined;
}
