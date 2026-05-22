import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";

export const MODEL_THINKING_MODES = ["enabled", "disabled"] as const satisfies readonly ModelThinkingMode[];
export const MODEL_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const satisfies readonly ModelReasoningEffort[];

export function normalizeModelThinkingMode(value: unknown): ModelThinkingMode | undefined {
  return readKnownValue(value, MODEL_THINKING_MODES);
}

export function normalizeModelReasoningEffort(value: unknown): ModelReasoningEffort | undefined {
  return readKnownValue(value, MODEL_REASONING_EFFORTS);
}

function readKnownValue<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return values.find((item) => item === normalized);
}
