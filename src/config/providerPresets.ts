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
    label: "Groq + GPT-OSS 120B",
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    thinking: "disabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
  {
    label: "Cerebras + GPT-OSS 120B",
    provider: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "gpt-oss-120b",
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
    label: "YLS Codex + GPT-5.5",
    provider: "yls",
    baseUrl: "https://code.ylsagi.com/codex",
    model: "gpt-5.5",
    thinking: "enabled",
    reasoningEffort: "high",
    activeByDefault: false,
  },
  {
    label: "YLS Codex + GPT-5.4",
    provider: "yls",
    baseUrl: "https://code.ylsagi.com/codex",
    model: "gpt-5.4",
    thinking: "enabled",
    reasoningEffort: "xhigh",
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
