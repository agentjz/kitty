export type TuiActivityKind = "model" | "tool" | "background" | "status";
export type TuiActivityStatus = "running" | "waiting" | "failed" | "completed";
export type TuiActivitySeverity = "info" | "warning" | "error" | "success";

export interface TuiActivity {
  readonly kind: TuiActivityKind;
  readonly status: TuiActivityStatus;
  readonly summary: string;
  readonly detail?: string;
  readonly toolName?: string;
  readonly startedAt?: number;
  readonly severity: TuiActivitySeverity;
}

export function createRunningActivity(input: {
  readonly kind: TuiActivityKind;
  readonly summary: string;
  readonly detail?: string;
  readonly toolName?: string;
  readonly now?: number;
}): TuiActivity {
  return {
    kind: input.kind,
    status: input.kind === "status" ? "waiting" : "running",
    summary: input.summary,
    detail: input.detail,
    toolName: input.toolName,
    startedAt: input.now ?? Date.now(),
    severity: "info",
  };
}

export function createFailedActivity(input: {
  readonly kind: TuiActivityKind;
  readonly summary: string;
  readonly detail?: string;
  readonly toolName?: string;
}): TuiActivity {
  return {
    kind: input.kind,
    status: "failed",
    summary: input.summary,
    detail: input.detail,
    toolName: input.toolName,
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
