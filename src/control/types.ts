import type { ExecutionKind } from "../execution/kinds.js";

export type ExecutionStatus = "created" | "running" | "completed" | "failed" | "aborted" | "lost";
export type WakeSignalReason = "completed" | "failed" | "aborted" | "lost";

export interface ExecutionRecord {
  id: string;
  kind: ExecutionKind;
  status: ExecutionStatus;
  command: string;
  cwd: string;
  requestedBy: string;
  ownerSessionId: string;
  createdBySessionId: string;
  parentTurnId: string;
  originToolCallId: string;
  pid?: number;
  exitCode?: number | null;
  output?: string;
  summary?: string;
  deadlineAt?: string;
  lastOutputAt?: string;
  closeReason?: string;
  terminatedBy?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  timeoutMs?: number;
}

export interface WakeSignalRecord {
  id: string;
  executionId: string;
  reason: WakeSignalReason;
  createdAt: string;
}

export type TaskLifecycleStage =
  | "light_response"
  | "normal_work"
  | "deep_work"
  | "background_wait"
  | "recovery"
  | "completed";

export interface TaskLifecycleRecord {
  id: string;
  sessionId: string;
  stage: TaskLifecycleStage;
  scope?: string;
  boundary?: string;
  reason?: string;
  activeExecutionIds: string[];
  activeTodoIds: string[];
  verificationFacts: string[];
  completionFacts: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
