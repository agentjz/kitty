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
    label: "Agnes AI｜Agnes 2.0 Flash｜免费｜稳定",
    provider: "agnes",
    model: "agnes-2.0-flash",
    thinking: "enabled",
    activeByDefault: true,
  },
  {
    id: "agnes-2.5-flash",
    label: "Agnes AI｜Agnes 2.5 Flash｜免费｜灰度",
    provider: "agnes",
    model: "agnes-2.5-flash",
    thinking: "enabled",
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
    id: "glm-4.7-flash",
    label: "智谱 AI｜GLM-4.7 Flash｜免费｜200K 上下文",
    provider: "zhipu",
    model: "glm-4.7-flash",
    thinking: "enabled",
    activeByDefault: false,
  },
  {
    id: "glm-4.6",
    label: "智谱 AI｜GLM-4.6｜200K 上下文",
    provider: "zhipu",
    model: "glm-4.6",
    thinking: "enabled",
    activeByDefault: false,
  },
  {
    id: "glm-4.7",
    label: "智谱 AI｜GLM-4.7｜200K 上下文",
    provider: "zhipu",
    model: "glm-4.7",
    thinking: "enabled",
    activeByDefault: false,
  },
  {
    id: "glm-5",
    label: "智谱 AI｜GLM-5｜200K 上下文",
    provider: "zhipu",
    model: "glm-5",
    thinking: "enabled",
    activeByDefault: false,
  },
  {
    id: "glm-5-turbo",
    label: "智谱 AI｜GLM-5 Turbo｜高速｜200K 上下文",
    provider: "zhipu",
    model: "glm-5-turbo",
    thinking: "enabled",
    activeByDefault: false,
  },
  {
    id: "glm-5.1",
    label: "智谱 AI｜GLM-5.1｜200K 上下文",
    provider: "zhipu",
    model: "glm-5.1",
    thinking: "enabled",
    activeByDefault: false,
  },
  {
    id: "glm-5.2",
    label: "智谱 AI｜GLM-5.2｜1M 上下文",
    provider: "zhipu",
    model: "glm-5.2",
    thinking: "enabled",
    reasoningEffort: "max",
    activeByDefault: false,
  },
] as const;

export function getDefaultProviderPreset(): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.activeByDefault) ?? PROVIDER_PRESETS[0]!;
}

export function getProviderPresetBaseUrl(preset: ProviderPreset): string {
  return resolveModelProfile(preset).provider.defaultBaseUrl;
}
