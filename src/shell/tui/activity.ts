import type { RuntimeUiChannel } from "../../runtime-ui/events.js";

export type TuiActivityKind = "model" | "tool" | "subagent" | "background" | "status";
export type TuiActivityStatus = "running" | "waiting" | "failed" | "completed";
export type TuiActivitySeverity = "info" | "warning" | "error" | "success";

export interface TuiActivity {
  readonly kind: TuiActivityKind;
  readonly channel: RuntimeUiChannel;
  readonly status: TuiActivityStatus;
  readonly summary: string;
  readonly detail?: string;
  readonly toolName?: string;
  readonly startedAt?: number;
  readonly blockingLead?: boolean;
  readonly severity: TuiActivitySeverity;
}

export function createRunningActivity(input: {
  readonly kind: TuiActivityKind;
  readonly channel?: RuntimeUiChannel;
  readonly summary: string;
  readonly detail?: string;
  readonly toolName?: string;
  readonly blockingLead?: boolean;
  readonly now?: number;
}): TuiActivity {
  return {
    kind: input.kind,
    channel: input.channel ?? "lead",
    status: input.kind === "status" ? "waiting" : "running",
    summary: input.summary,
    detail: input.detail,
    toolName: input.toolName,
    startedAt: input.now ?? Date.now(),
    blockingLead: input.blockingLead,
    severity: input.blockingLead ? "warning" : "info",
  };
}

export function createFailedActivity(input: {
  readonly kind: TuiActivityKind;
  readonly channel?: RuntimeUiChannel;
  readonly summary: string;
  readonly detail?: string;
  readonly toolName?: string;
  readonly blockingLead?: boolean;
}): TuiActivity {
  return {
    kind: input.kind,
    channel: input.channel ?? "lead",
    status: "failed",
    summary: input.summary,
    detail: input.detail,
    toolName: input.toolName,
    blockingLead: input.blockingLead,
    severity: "error",
  };
}

export function formatElapsedCompact(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
}

