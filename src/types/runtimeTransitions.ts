export interface RuntimeContinueToolBatchReason {
  code: "continue.after_tool_batch";
  toolNames: string[];
  changedPaths: string[];
}

export interface RuntimeContinueEmptyAssistantResponseReason {
  code: "continue.empty_assistant_response";
}

export interface RuntimeFinalizeCompletedReason {
  code: "finalize.completed";
  changedPaths: string[];
}

export interface RuntimeYieldExecutionWaitReason {
  code: "yield.execution_wait";
  executionIds: string[];
  toolNames: string[];
}

export type RuntimeContinueReason =
  | RuntimeContinueToolBatchReason
  | RuntimeContinueEmptyAssistantResponseReason;

export type RuntimeFinalizeReason = RuntimeFinalizeCompletedReason;

export type RuntimeYieldReason = RuntimeYieldExecutionWaitReason;

export interface RuntimeContinueTransition {
  action: "continue";
  reason: RuntimeContinueReason;
  timestamp: string;
}

export interface RuntimeFinalizeTransition {
  action: "finalize";
  reason: RuntimeFinalizeReason;
  timestamp: string;
}

export interface RuntimeYieldTransition {
  action: "yield";
  reason: RuntimeYieldReason;
  timestamp: string;
}

export type RuntimeTransition =
  | RuntimeContinueTransition
  | RuntimeFinalizeTransition
  | RuntimeYieldTransition;

export type RuntimeTerminalTransition = RuntimeFinalizeTransition | RuntimeYieldTransition;
