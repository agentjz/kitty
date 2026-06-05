import type { ExecutionKind } from "../execution/kinds.js";
import type { LeadWaitPolicy } from "../protocol/leadWait.js";

export type ExecutionStatus = "created" | "running" | "paused" | "completed" | "failed" | "aborted" | "stale";
export type WakeSignalReason = "completed" | "failed" | "aborted" | "paused" | "stale";

export interface ExecutionRecord {
  id: string;
  kind: ExecutionKind;
  status: ExecutionStatus;
  assignment?: ExecutionAssignment;
  command?: string;
  prompt?: string;
  actorName?: string;
  actorRole?: string;
  cwd: string;
  requestedBy: string;
  sessionId?: string;
  pid?: number;
  exitCode?: number | null;
  output?: string;
  summary?: string;
  waitPolicy?: LeadWaitPolicy;
  deadlineAt?: string;
  lastOutputAt?: string;
  closeReason?: string;
  terminatedBy?: string;
  changedPaths: string[];
  error?: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  timeoutMs?: number;
}

export interface ExecutionAssignment {
  objective?: string;
  boundary?: string;
  expectedOutput?: string;
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
  | "spec_work"
  | "background_wait"
  | "delegated_wait"
  | "recovery"
  | "completed";

export interface TaskLifecycleRecord {
  id: string;
  sessionId: string;
  stage: TaskLifecycleStage;
  objective?: string;
  scope?: string;
  boundary?: string;
  reason?: string;
  activeExecutionIds: string[];
  activeSpecId?: string;
  activeTodoIds: string[];
  verificationFacts: string[];
  completionFacts: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
