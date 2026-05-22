import type { ExecutionKind } from "../execution/kinds.js";
import type { LeadWaitPolicy } from "../protocol/leadWait.js";

export type ExecutionStatus = "created" | "running" | "paused" | "completed" | "failed" | "aborted" | "stale";
export type WakeSignalReason = "completed" | "failed" | "aborted" | "paused" | "stale";

export interface ExecutionRecord {
  id: string;
  kind: ExecutionKind;
  status: ExecutionStatus;
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

export interface TeamMemberRecord {
  name: string;
  role: string;
  status: "working" | "idle" | "shutdown";
  executionId?: string;
  sessionId?: string;
  pid?: number;
  updatedAt: string;
}

export interface TeamMessageRecord {
  id: string;
  from: string;
  to: string;
  message: string;
  createdAt: string;
}

