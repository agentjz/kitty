import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";
import { resolveModelProfile } from "../provider/catalog.js";

export interface ProviderPreset {
  id: string;
  label: string;
  provider: string;
  model: string;
  thinking?: ModelThinkingMode;
  reasoningEffort?: ModelReasoningEffort;
  activeByDefault: boolean;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "agnes-2.0-flash",
    label: "Agnes AI + 2.0 Flash",
    provider: "agnes",
    model: "agnes-2.0-flash",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: true,
  },
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek official V4",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
] as const;

export function getDefaultProviderPreset(): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.activeByDefault) ?? PROVIDER_PRESETS[0]!;
}

export function getProviderPresetBaseUrl(preset: ProviderPreset): string {
  return resolveModelProfile(preset).provider.defaultBaseUrl;
}
