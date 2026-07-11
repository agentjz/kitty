import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";

export interface ProviderPreset {
  label: string;
  provider: string;
  baseUrl: string;
  model: string;
  thinking?: ModelThinkingMode;
  reasoningEffort?: ModelReasoningEffort;
  activeByDefault: boolean;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    label: "NVIDIA NIM + DeepSeek V4 Flash",
    provider: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "deepseek-ai/deepseek-v4-flash",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: true,
  },
  {
    label: "Agnes AI + 2.0 Flash",
    provider: "agnes",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    model: "agnes-2.0-flash",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
  {
    label: "Gemini + 2.5 Flash",
    provider: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    thinking: "disabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
  {
    label: "TTAPI + GPT-5.4",
    provider: "ttapi",
    baseUrl: "https://w.ciykj.cn",
    model: "gpt-5.4",
    thinking: "disabled",
    reasoningEffort: "xhigh",
    activeByDefault: false,
  },
  {
    label: "DeepSeek official V4",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
] as const;

export function getDefaultProviderPreset(): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.activeByDefault) ?? PROVIDER_PRESETS[0]!;
}
