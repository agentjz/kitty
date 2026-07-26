import type { SessionStoreLike } from "../session/store.js";
import type { ToolRegistry } from "../tools/core/types.js";
import type { RuntimeConfig, RuntimeTerminalTransition, SessionRecord, ToolCallRecord } from "../types.js";
import type { FunctionToolDefinition } from "../tools/index.js";
import type { ProviderCapabilities } from "../provider/capabilities.js";
import type { ProviderMessage } from "../provider/contract.js";
import type { PromptRuntimeState } from "./prompt/types.js";

export interface AgentCallbacks {
  onModelWaitStart?: () => void;
  onModelWaitStop?: () => void;
  onStatus?: (text: string) => void;
  onAssistantStage?: (text: string) => void;
  onAssistantDelta?: (delta: string) => void;
  onAssistantDone?: (fullText: string) => void;
  onAssistantText?: (text: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onReasoning?: (text: string) => void;
  onToolCallProgress?: (progress: ToolCallProgress) => void;
  onToolCall?: (name: string, args: string) => void;
  onToolResult?: (name: string, output: string) => void;
  onToolError?: (name: string, error: string) => void;

  /** Optional host callback to send a file back to the conversation (e.g. Telegram sendDocument). */
  enqueueFile?: (filePath: string, fileName?: string, caption?: string) => Promise<string | undefined>;
}

export interface ToolCallProgress {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly argumentBytesReceived: number;
}

export interface RunTurnOptions {
  turnId?: string;
  turnOwnerToken?: string;
  turnOwnerGeneration?: number;
  ownerSessionId?: string;
  input: string;
  inputSource?: "external" | "internal";
  cwd: string;
  stateRootDir?: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  toolRegistry?: ToolRegistry;
  runtimePromptState?: Partial<PromptRuntimeState>;
  abortSignal?: AbortSignal;
  callbacks?: AgentCallbacks;
  fetchAssistantResponse?: (input: ModelRequestInput) => Promise<AssistantResponse>;
  fetchSessionTitleResponse?: (input: ModelRequestInput) => Promise<AssistantResponse>;
  steering?: {
    consumePending: (session: SessionRecord) => Promise<{
      session: SessionRecord;
      inputs: string[];
    }>;
    beginClosing: () => Promise<boolean>;
  };
}

export interface ModelRequestInput {
  messages: ProviderMessage[];
  request: {
    provider: string;
    model: string;
    thinking?: RuntimeConfig["thinking"];
    reasoningEffort?: RuntimeConfig["reasoningEffort"];
    maxOutputTokens?: RuntimeConfig["maxOutputTokens"];
    capabilities?: ProviderCapabilities;
  };
  tools: FunctionToolDefinition[];
  callbacks?: AgentCallbacks;
  abortSignal?: AbortSignal;
  observability?: {
    rootDir: string;
    sessionId: string;
    configuredModel: string;
  };
}

export interface AssistantResponse {
  content: string | null;
  reasoningContent?: string;
  streamedAssistantContent?: boolean;
  streamedReasoningContent?: boolean;
  toolCalls: ToolCallRecord[];
}

export interface RunTurnResult {
  session: SessionRecord;
  changedPaths: string[];
  transition?: RuntimeTerminalTransition;
}
