import { normalizeModelReasoningEffort, normalizeModelThinkingMode } from "./modelOptions.js";
import type { RuntimeConfig } from "../types.js";

export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function parseIntegerEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseReasoningEffortEnv(value: string | undefined): RuntimeConfig["reasoningEffort"] | undefined {
  return normalizeModelReasoningEffort(value);
}

export function parseThinkingEnv(value: string | undefined): RuntimeConfig["thinking"] | undefined {
  return normalizeModelThinkingMode(value);
}

