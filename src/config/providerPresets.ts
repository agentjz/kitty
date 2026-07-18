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
    id: "nvidia-deepseek-v4-flash",
    label: "NVIDIA NIM + DeepSeek V4 Flash",
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-flash",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
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
    id: "gemini-2.5-flash",
    label: "Gemini + 2.5 Flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
    thinking: "disabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
  {
    id: "yls-gpt-5.4",
    label: "YLS Codex + GPT-5.4",
    provider: "yls",
    model: "gpt-5.4",
    thinking: "enabled",
    reasoningEffort: "xhigh",
    activeByDefault: false,
  },
  {
    id: "ttapi-gpt-5.4",
    label: "TTAPI + GPT-5.4",
    provider: "ttapi",
    model: "gpt-5.4",
    thinking: "disabled",
    reasoningEffort: "xhigh",
    activeByDefault: false,
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
  {
    id: "llama-gemma-3-12b",
    label: "本机 + Google Gemma 3 12B",
    provider: "llama.cpp",
    model: "gemma-3-12b-it-q4_0.gguf",
    thinking: "disabled",
    activeByDefault: false,
  },
  {
    id: "llama-qwen3-8b",
    label: "本机 + Qwen3 8B 工具调用",
    provider: "llama.cpp",
    model: "Qwen3-8B-Q4_K_M.gguf",
    thinking: "enabled",
    activeByDefault: false,
  },
  {
    id: "llama-qwen3-4b",
    label: "本机 + Qwen3 4B 工具调用",
    provider: "llama.cpp",
    model: "Qwen3-4B-Q4_K_M.gguf",
    thinking: "enabled",
    activeByDefault: false,
  },
] as const;

export function getDefaultProviderPreset(): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.activeByDefault) ?? PROVIDER_PRESETS[0]!;
}

export function getProviderPresetBaseUrl(preset: ProviderPreset): string {
  return resolveModelProfile(preset).provider.defaultBaseUrl;
}
