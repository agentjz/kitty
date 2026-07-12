import { INITIAL_TELEGRAM_CONFIG } from "./hosts.js";
import { getInitialExtensionSwitches } from "./extensions.js";
import { getDefaultProviderPreset, getProviderPresetBaseUrl } from "./providerPresets.js";
import type { AppConfig } from "../types.js";

export function getInitialRuntimeConfig(): AppConfig {
  const preset = getDefaultProviderPreset();
  return {
    locale: "zh-CN",
    provider: preset.provider,
    baseUrl: getProviderPresetBaseUrl(preset),
    model: preset.model,
    profile: "intp",
    thinking: preset.thinking,
    reasoningEffort: preset.reasoningEffort,
    contextWindowMessages: 120,
    maxContextChars: 900_000,
    contextSummaryChars: 120_000,
    maxOutputTokens: 384_000,
    maxReadBytes: 120_000,
    projectDocMaxBytes: 24_576,
    commandStallTimeoutMs: 30_000,
    showReasoning: true,
    telegram: structuredClone(INITIAL_TELEGRAM_CONFIG),
    extensions: getInitialExtensionSwitches(),
  };
}
