import type { ChatCompletionTool } from "openai/resources/chat/completions";

import type { ChangeStore } from "../../agent/changes/store.js";
import type { AgentCallbacks } from "../../agent/types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  TodoItem,
  ToolExecutionResult,
} from "../../types.js";

export type FunctionToolDefinition = Extract<ChatCompletionTool, { type: "function" }>;

export type ToolOriginKind = "builtin" | "host";
export type ToolChangeSignal = "none" | "required";
export type ToolEffect = "read" | "write" | "process" | "external" | "state";

export interface ToolOrigin {
  kind: ToolOriginKind;
  sourceId?: string;
}

export interface RegisteredTool {
  definition: FunctionToolDefinition;
  execute: (rawArgs: string, context: ToolContext) => Promise<ToolExecutionResult>;
  changeSignal?: ToolChangeSignal;
  effect?: ToolEffect;
  parallelSafe?: boolean;
  origin?: ToolOrigin;
}

export interface ToolRegistryEntry {
  name: string;
  definition: FunctionToolDefinition;
  changeSignal?: ToolChangeSignal;
  effect: ToolEffect;
  parallelSafe: boolean;
  origin: ToolOrigin;
  tool: RegisteredTool;
}

export interface ToolRegistrySource {
  kind: ToolOriginKind;
  id: string;
  tools: readonly RegisteredTool[];
}

export interface ToolRegistry {
  definitions: FunctionToolDefinition[];
  entries?: ToolRegistryEntry[];
  execute: (name: string, rawArgs: string, context: ToolContext) => Promise<ToolExecutionResult>;
  close?: () => Promise<void>;
}

export interface ToolRegistryOptions {
  onlyNames?: readonly string[];
  excludeNames?: readonly string[];
  builtinToolFilter?: ToolFilter;
  sources?: readonly ToolRegistrySource[];
}

export type ToolFilter = (tool: RegisteredTool) => boolean;

export type ToolRegistryFactory = (options?: ToolRegistryOptions) => ToolRegistry;

export interface ToolContext {
  config: RuntimeConfig;
  cwd: string;
  sessionId: string;
  ownerSessionId: string;
  turnId: string;
  toolCallId: string;
  callbacks?: AgentCallbacks;
  abortSignal?: AbortSignal;
  runtimeState?: {
    todoItems?: TodoItem[];
  };
  projectContext: ProjectContext;
  changeStore: ChangeStore;
  createToolRegistry: ToolRegistryFactory;
  recordWorksetFile?: (input: {
    path: string;
    toolName: string;
    changed: boolean;
    changeId?: string;
    reason?: string;
  }) => Promise<void>;

  /** Optional host callback to enqueue a file for delivery (e.g. Telegram document upload). */
  enqueueFile?: (filePath: string, fileName?: string, caption?: string) => Promise<string | undefined>;
}
