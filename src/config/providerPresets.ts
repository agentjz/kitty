import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";
import { resolveModelProfile } from "../provider/catalog.js";

export interface ProviderPreset {
  label: string;
  provider: string;
  model: string;
  thinking?: ModelThinkingMode;
  reasoningEffort?: ModelReasoningEffort;
  activeByDefault: boolean;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    label: "NVIDIA NIM + DeepSeek V4 Flash",
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-flash",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
  {
    label: "Agnes AI + 2.0 Flash",
    provider: "agnes",
    model: "agnes-2.0-flash",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: true,
  },
  {
    label: "Gemini + 2.5 Flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
    thinking: "disabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
  {
    label: "YLS Codex + GPT-5.4",
    provider: "yls",
    model: "gpt-5.4",
    thinking: "enabled",
    reasoningEffort: "xhigh",
    activeByDefault: false,
  },
  {
    label: "TTAPI + GPT-5.4",
    provider: "ttapi",
    model: "gpt-5.4",
    thinking: "disabled",
    reasoningEffort: "xhigh",
    activeByDefault: false,
  },
  {
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
