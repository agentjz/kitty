export type ScheduledAction =
  | { type: "reminder"; text: string }
  | { type: "command"; command: string; cwd: string; timeoutMs: number };

export type ScheduleSpec =
  | { type: "once"; runAt: string }
  | { type: "interval"; intervalMinutes: number }
  | { type: "daily"; time: string; timezone: string };

export interface ScheduledTaskRecord {
  id: string;
  name: string;
  enabled: boolean;
  action: ScheduledAction;
  schedule: ScheduleSpec;
  nextRunAt?: string;
  creatorSessionId?: string;
  lastTriggerAt?: string;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ScheduledTriggerStatus =
  | "claimed"
  | "succeeded"
  | "failed"
  | "interrupted"
  | "uncertain";

export interface ScheduledTriggerRecord {
  id: string;
  taskId: string;
  scheduledFor: string;
  status: ScheduledTriggerStatus;
  claimToken: string;
  claimExpiresAt: string;
  executionId?: string;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}
