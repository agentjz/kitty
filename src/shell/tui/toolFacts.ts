import type { ToolCallProgress } from "../../agent/types.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../../i18n/index.js";
import {
  projectToolCallPresentation,
  projectToolResultPresentation,
  readToolResultLifecycleStatus,
  type ToolPlanItem,
} from "../../runtime-ui/toolPresentation.js";
import { createFailedActivity, createRunningActivity, type TuiActivity, type TuiActivityKind } from "./activity.js";
import type { TuiTranscriptRole } from "./transcriptTypes.js";

export interface TuiToolCallFact {
  readonly activity: TuiActivity;
  readonly background?: string;
}

export interface TuiToolResultFact {
  readonly activity: TuiActivity | undefined;
  readonly background?: string;
  readonly transcript?: {
    readonly role: TuiTranscriptRole;
    readonly text: string;
    readonly planItems?: readonly ToolPlanItem[];
  };
}

export function projectTuiToolCallFact(name: string, rawArgs: string, options: { now?: number } = {}): TuiToolCallFact {
  const presentation = projectToolCallPresentation(name, rawArgs);
  const target = "target" in presentation ? presentation.target : undefined;
  const summary = target ? `${name} ${target}` : name;
  return {
    activity: createRunningActivity({
      kind: readActivityKind(name),
      summary,
      toolName: name,
      now: options.now,
    }),
    ...projectLiveBackgroundFact(name, name),
  };
}

export function projectTuiToolCallProgressFact(
  progress: ToolCallProgress,
  options: { now?: number } = {},
): TuiToolCallFact | undefined {
  const name = progress.name.toLowerCase();
  if (name !== "write" && name !== "edit") {
    return undefined;
  }

  return {
    activity: createRunningActivity({
      kind: "tool",
      summary: progress.name,
      detail: formatProgressBytes(progress.argumentBytesReceived),
      toolName: progress.name,
      now: options.now,
    }),
  };
}

export function projectTuiToolResultFact(
  name: string,
  rawOutput: string,
  locale: KittyLocale = DEFAULT_LOCALE,
): TuiToolResultFact {
  const presentation = projectToolResultPresentation(name, rawOutput);
  return {
    activity: undefined,
    ...projectLiveBackgroundFact(name, readRunningSummary(name, rawOutput)),
    transcript: projectToolTranscript(presentation, locale),
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
  const status = readToolResultLifecycleStatus(rawOutput);
  return status === "running" || status === "created" ? name : undefined;
}

function projectToolTranscript(
  presentation: ReturnType<typeof projectToolResultPresentation>,
  locale: KittyLocale,
): TuiToolResultFact["transcript"] {
  switch (presentation.kind) {
    case "change":
      return {
        role: "change",
        text: [
          `${translate(locale, presentation.action === "created" ? "tui.tool.created" : "tui.tool.updated")} ${presentation.path}`,
          `  +${presentation.addedLines} -${presentation.removedLines}`,
          ...presentation.diffLines.map((line) => `  ${line}`),
        ].join("\n"),
      };
    case "document-change":
      return {
        role: "change",
        text: `${translate(locale, presentation.action === "created" ? "tui.tool.created" : "tui.tool.updated")} ${presentation.path}`,
      };
    case "read": {
      const range = presentation.startLine !== undefined && presentation.endLine !== undefined
        ? ` · ${presentation.startLine}-${presentation.endLine}`
        : "";
      return {
        role: "tool",
        text: `${translate(locale, "tui.tool.read")} ${presentation.path}${range}`,
      };
    }
    case "command": {
      const facts = [
        presentation.status,
        presentation.durationMs === undefined ? undefined : `${presentation.durationMs}ms`,
      ].filter(Boolean).join(" · ");
      return {
        role: "tool",
        text: `${translate(locale, "tui.tool.ran")} ${presentation.command}${facts ? ` · ${facts}` : ""}`,
      };
    }
    case "plan":
      return {
        role: "plan",
        text: `${translate(locale, "tui.tool.updatedPlan")} · ${presentation.completed}/${presentation.items.length}`,
        planItems: presentation.items,
      };
    case "error":
      return { role: "tool", text: presentation.message };
    case "none":
      return undefined;
  }
}

function formatProgressBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${formatDecimal(bytes / 1_000)} kB`;
  return `${formatDecimal(bytes / 1_000_000)} MB`;
}

function formatDecimal(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}
