import type { RegisteredTool } from "../tools/core/types.js";
import { bashToolDefinition, editToolDefinition, readToolDefinition, sendFileToolDefinition, writeToolDefinition } from "./index.js";

export const agentCoreToolCatalog: readonly RegisteredTool[] = [
  withExecutionContract(readToolDefinition, "none", "read", true),
  withExecutionContract(writeToolDefinition, "required", "write"),
  withExecutionContract(editToolDefinition, "required", "write"),
  withExecutionContract(bashToolDefinition, "none", "process"),
  withExecutionContract(sendFileToolDefinition, "none", "external"),
];

export function getBuiltinTools(): readonly RegisteredTool[] {
  return agentCoreToolCatalog;
}

export function getBuiltinToolNames(): string[] {
  return getBuiltinTools().map((tool) => tool.definition.function.name);
}

function withExecutionContract(
  tool: RegisteredTool,
  changeSignal: NonNullable<RegisteredTool["changeSignal"]>,
  effect: NonNullable<RegisteredTool["effect"]>,
  parallelSafe = false,
): RegisteredTool {
  return {
    ...tool,
    changeSignal,
    effect,
    parallelSafe,
    origin: {
      kind: "builtin",
      sourceId: "builtin:core",
    },
  };
}
