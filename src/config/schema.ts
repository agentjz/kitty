import { normalizeTelegramConfig } from "../config/hosts.js";
import { resolveModelProfile } from "../provider/catalog.js";
import { normalizeModelReasoningEffort, normalizeModelThinkingMode } from "./modelOptions.js";
import { normalizeExtensions } from "./extensions.js";
import { invalidConfigValue, missingConfigValue } from "./errors.js";
import type { AppConfig } from "../types.js";

export const CURRENT_CONFIG_SCHEMA_VERSION = 1 as const;

export function normalizeRuntimeConfig(
  config: AppConfig,
  runtime: {
    cwd?: string;
    cacheDir?: string;
    stateRootDir?: string;
  } = {},
): AppConfig {
  const normalized = {
    schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    provider: requireTextConfig(config.provider, "provider"),
    baseUrl: requireTextConfig(config.baseUrl, "baseUrl"),
    model: requireTextConfig(config.model, "model"),
    profile: requireTextConfig(config.profile, "profile"),
    thinking: normalizeModelThinkingMode(config.thinking),
    reasoningEffort: normalizeModelReasoningEffort(config.reasoningEffort),
    maxOutputTokens: clampNumber(config.maxOutputTokens, 1, 384_000, "maxOutputTokens"),
    contextWindowMessages: clampNumber(config.contextWindowMessages, 6, 480, "contextWindowMessages"),
    maxContextChars: clampNumber(config.maxContextChars, 8_000, 1_000_000, "maxContextChars"),
    contextSummaryChars: clampNumber(
      config.contextSummaryChars,
      1_000,
      160_000,
      "contextSummaryChars",
    ),
    maxReadBytes: clampNumber(config.maxReadBytes, 2_000, 500_000, "maxReadBytes"),
    projectDocMaxBytes: clampNumber(config.projectDocMaxBytes, 1_000, 500_000, "projectDocMaxBytes"),
    commandStallTimeoutMs: clampNumber(config.commandStallTimeoutMs, 2_000, 300_000, "commandStallTimeoutMs"),
    showReasoning: requireBooleanConfig(config.showReasoning, "showReasoning"),
    telegram: normalizeTelegramConfig(config.telegram),
    extensions: normalizeExtensions(config.extensions),
  };

  validateProviderModelConfig(normalized);
  return normalized;
}

function validateProviderModelConfig(config: Pick<AppConfig, "provider" | "model">): void {
  try {
    resolveModelProfile(config);
  } catch (error) {
    throw invalidConfigValue(
      "KITTY_PROVIDER/KITTY_MODEL",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function requireTextConfig(value: unknown, name: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw missingConfigValue(name);
  }
  return normalized;
}

function requireBooleanConfig(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw invalidConfigValue(name, `Missing or invalid config value: ${name}.`);
  }
  return value;
}

function clampNumber(value: number, min: number, max: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw invalidConfigValue(name, `Missing or invalid config value: ${name}.`);
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
