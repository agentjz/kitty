import type { ProviderMessage } from "../../provider/contract.js";
import type { PromptLayerMetrics, PromptLayers, PromptRuntimeState } from "../../agent/prompt/types.js";
import type { SessionConversationBrief } from "./sessionBrief/types.js";
import type { AgentWorkingMemory } from "./workingMemory/types.js";
import type { TaskLifecycleRecord } from "../../control/ledger.js";
import type {
  ProjectMap,
  ProjectContext,
  RuntimeConfig,
  SessionCheckpoint,
  SessionRecord,
  TaskState,
} from "../../types.js";

export interface ContextRuntimeSnapshot {
  sessionBrief?: SessionConversationBrief;
  taskLifecycle?: TaskLifecycleRecord;
  projectMap?: ProjectMap;
  workingMemory: AgentWorkingMemory;
  historyBoundary: {
    rawHistoryPolicy: "evidence_lookup_only";
    automaticSurfaces: string[];
  };
}

export interface BuildContextRuntimeSnapshotInput {
  projectMap?: ProjectMap;
  session: Pick<
    SessionRecord,
    "messages" | "sessionMemory" | "todoItems" | "taskState" | "checkpoint"
  >;
  taskLifecycle?: TaskLifecycleRecord;
}

export interface BuildContextRuntimePromptLayersInput {
  cwd: string;
  config: RuntimeConfig;
  projectContext: ProjectContext;
  taskState?: TaskState;
  todoItems?: SessionRecord["todoItems"];
  runtimeState?: PromptRuntimeState;
  taskLifecycle?: TaskLifecycleRecord;
  checkpoint?: SessionCheckpoint;
  sessionMemory?: SessionRecord["sessionMemory"];
  messages?: SessionRecord["messages"];
}

export interface ContextRuntimeRequestInput {
  prompt: string | PromptLayers;
  session: Pick<SessionRecord, "messages">;
  config: Pick<RuntimeConfig, "contextWindowMessages" | "model" | "maxContextChars" | "contextSummaryChars">;
}

export interface ContextRuntimeRequest {
  messages: ProviderMessage[];
  compressed: boolean;
  estimatedChars: number;
  summary?: string;
  promptMetrics?: PromptLayerMetrics;
}
