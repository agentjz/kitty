import type { RuntimeTransition } from "./runtimeTransitions.js";
import type { ToolDiagnosticsReport } from "./diagnostics.js";
import type { ContextBudgetReport } from "./contextBudget.js";
import type { ToolResultEnvelope } from "./toolEvidence.js";

export interface ToolCallRecord {
  id: string;
  type: "function";
  providerMetadata?: Record<string, unknown>;
  function: {
    name: string;
    arguments: string;
  };
}

export interface StoredMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  source?: "external" | "internal";
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallRecord[];
  reasoningContent?: string;
  toolResult?: ToolResultEnvelope;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  title?: string;
  messageCount: number;
  messages: StoredMessage[];
  todoItems?: TodoItem[];
  taskState?: TaskState;
  checkpoint?: SessionCheckpoint;
  sessionDiff?: SessionDiffState;
  contextBudget?: ContextBudgetReport;
  workset?: SessionWorksetState;
}

export interface SessionWorksetEntry {
  path: string;
  firstSeenAt: string;
  lastSeenAt: string;
  readCount: number;
  changedCount: number;
  lastTool: string;
  lastChangeId?: string;
  reason?: string;
}

export interface SessionWorksetState {
  files: SessionWorksetEntry[];
  updatedAt: string;
}

export interface SessionDiffChange {
  toolName: string;
  changeId?: string;
  changedPaths: string[];
  diff?: string;
  diagnosticsStatus: ToolDiagnosticsReport["status"];
  errorCount: number;
  warningCount: number;
  recordedAt: string;
}

export interface SessionDiffState {
  changedPaths: string[];
  changes: SessionDiffChange[];
  updatedAt: string;
}

export type SessionCheckpointStatus = "active" | "completed";
export type SessionCheckpointPhase = "active";

export interface SessionCheckpointToolBatch {
  tools: string[];
  summary: string;
  changedPaths: string[];
  recordedAt: string;
}

export type SessionRunStateStatus = "busy" | "idle";

export type SessionRunStateSource = "turn" | "tool_batch" | "checkpoint";

export interface SessionRunState {
  status: SessionRunStateStatus;
  source: SessionRunStateSource;
  pendingToolCallCount: number;
  updatedAt: string;
}

export interface SessionCheckpointFlow {
  phase: SessionCheckpointPhase;
  reason?: string;
  runState?: SessionRunState;
  lastTransition?: RuntimeTransition;
  updatedAt: string;
}

export interface SessionCheckpoint {
  focus?: string;
  focusFingerprint?: string;
  status: SessionCheckpointStatus;
  completedSteps: string[];
  recentToolBatch?: SessionCheckpointToolBatch;
  flow: SessionCheckpointFlow;
  updatedAt: string;
}

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

export interface TaskState {
  focus?: string;
  activeFiles: string[];
  plannedActions: string[];
  completedActions: string[];
  blockers: string[];
  lastUpdatedAt: string;
}
