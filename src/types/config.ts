import type { TelegramConfig, TelegramRuntimeConfig, WeixinConfig, WeixinRuntimeConfig } from "../config/hosts.js";
import type { ExtensionToggleConfig } from "../config/extensions.js";
import type { KittyLocale } from "../i18n/index.js";

export type ModelThinkingMode = "enabled" | "disabled";
export type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AppPaths {
  configDir: string;
  dataDir: string;
  cacheDir: string;
  sessionsDir: string;
  changesDir: string;
  eventsDir: string;
}

export interface AppConfig {
  locale: KittyLocale;
  provider: string;
  baseUrl: string;
  model: string;
  profile: string;
  thinking?: ModelThinkingMode;
  reasoningEffort?: ModelReasoningEffort;
  maxOutputTokens: number;
  contextWindowMessages: number;
  maxContextChars: number;
  contextSummaryChars: number;
  maxReadBytes: number;
  projectDocMaxBytes: number;
  commandStallTimeoutMs: number;
  showReasoning: boolean;
  telegram: TelegramConfig;
  weixin: WeixinConfig;
  extensions: ExtensionToggleConfig;
}

export interface RuntimeConfig extends AppConfig {
  apiKey: string;
  paths: AppPaths;
  telegram: TelegramRuntimeConfig;
  weixin: WeixinRuntimeConfig;
}

export interface CliOverrides {
  cwd?: string;
  model?: string;
}

