import { INITIAL_TELEGRAM_CONFIG, INITIAL_WEIXIN_CONFIG } from "./hosts.js";
import { getInitialExtensionSwitches } from "./extensions.js";
import { getDefaultProviderPreset, getProviderPresetBaseUrl } from "./providerPresets.js";
import type { AppConfig } from "../types.js";
import { DEFAULT_MEDIA_CONFIG } from "./media.js";

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
    media: structuredClone(DEFAULT_MEDIA_CONFIG),
    telegram: structuredClone(INITIAL_TELEGRAM_CONFIG),
    weixin: structuredClone(INITIAL_WEIXIN_CONFIG),
    extensions: getInitialExtensionSwitches(),
  };
}
