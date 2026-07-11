import type { ProviderMessage } from "../../provider/contract.js";
import type { PromptLayerMetrics, PromptLayers, PromptRuntimeState } from "../../agent/prompt/types.js";
import type { SessionConversationBrief } from "./sessionBrief/types.js";
import type { AgentWorkingMemory } from "./workingMemory/types.js";
import type { TaskLifecycleRecord } from "../../control/ledger.js";
import type { ContextBudgetReport, ContextCacheLayoutReport } from "../../types/contextBudget.js";
import type {
  ProjectMap,
  ProjectContext,
  RuntimeConfig,
  SessionCheckpoint,
  SessionRecord,
  SessionWorksetState,
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
    "messages" | "todoItems" | "taskState" | "checkpoint" | "workset"
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
  workset?: SessionWorksetState;
  messages?: SessionRecord["messages"];
}

export interface ContextRuntimeRequestInput {
  prompt: string | PromptLayers;
  session: Pick<SessionRecord, "messages">;
  config: Pick<RuntimeConfig, "contextWindowMessages" | "model" | "maxContextChars" | "contextSummaryChars"> & {
    provider?: RuntimeConfig["provider"];
    maxOutputTokens?: RuntimeConfig["maxOutputTokens"];
  };
}

export interface ContextRuntimeRequest {
  messages: ProviderMessage[];
  compressed: boolean;
  estimatedChars: number;
  budget: ContextBudgetReport;
  summary?: string;
  promptMetrics?: PromptLayerMetrics;
  cacheLayout?: ContextCacheLayoutReport;
  epoch?: {
    sourceMessageCount: number;
    sourceLastMessageId?: string;
    sourcePrefixHash: string;
    summary: string;
  };
}
