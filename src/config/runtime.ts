import { loadDotEnvFiles } from "./env.js";
import { ensureAppDirectories } from "./directories.js";
import {
  parseBooleanEnv,
  parseIntegerEnv,
  parseReasoningEffortEnv,
  parseThinkingEnv,
} from "./runtimeEnv.js";
import { KITTY_BASE_ENV, KITTY_ENV } from "./envKeys.js";
import { EXTENSION_IDS } from "../extensions/definitions.js";
import { normalizeRuntimeConfig } from "./schema.js";
import { invalidConfigValue, missingConfigValue } from "./errors.js";
import { resolveAgentProfile } from "../agent/profiles/registry.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import {
  parseTelegramAllowedUserIds,
  resolveTelegramRuntimeConfig,
  parseWeixinAllowedUserIds,
  resolveWeixinRuntimeConfig,
} from "../config/hosts.js";
import type { CliOverrides, RuntimeConfig } from "../types.js";

export async function resolveRuntimeConfig(overrides: CliOverrides = {}): Promise<RuntimeConfig> {
  const cwd = overrides.cwd ?? process.cwd();
  loadDotEnvFiles(cwd);
  const paths = await ensureAppDirectories(cwd);
  const projectRoots = await resolveProjectRoots(cwd);
  const env = readRuntimeEnv();
  const telegramAllowedUserIds = parseTelegramAllowedUserIds(env.telegramAllowedUserIds);
  const weixinAllowedUserIds = parseWeixinAllowedUserIds(env.weixinAllowedUserIds);

  const merged = normalizeRuntimeConfig({
    locale: env.locale,
    provider: env.provider,
    model: overrides.model ?? env.model,
    profile: env.profile,
    thinking: parseThinkingEnv(env.thinking),
    reasoningEffort: parseReasoningEffortEnv(env.reasoningEffort),
    maxOutputTokens: readIntegerEnv("maxOutputTokens", env.maxOutputTokens),
    baseUrl: env.baseUrl,
    contextWindowMessages: readIntegerEnv("contextWindowMessages", env.contextWindowMessages),
    maxContextChars: readIntegerEnv("maxContextChars", env.maxContextChars),
    contextSummaryChars: readIntegerEnv("contextSummaryChars", env.contextSummaryChars),
    maxReadBytes: readIntegerEnv("maxReadBytes", env.maxReadBytes),
    projectDocMaxBytes: readIntegerEnv("projectDocMaxBytes", env.projectDocMaxBytes),
    commandStallTimeoutMs: readIntegerEnv("commandStallTimeoutMs", env.commandStallTimeoutMs),
    showReasoning: readBooleanEnv("showReasoning", env.showReasoning),
    telegram: {
      token: env.telegramToken,
      apiBaseUrl: env.telegramApiBaseUrl,
      proxyUrl: env.telegramProxyUrl,
      allowedUserIds: telegramAllowedUserIds,
      polling: {
        timeoutSeconds: readIntegerEnv("telegramPollingTimeoutSeconds", env.telegramPollingTimeoutSeconds),
        limit: readIntegerEnv("telegramPollingLimit", env.telegramPollingLimit),
        retryBackoffMs: readIntegerEnv("telegramPollingRetryBackoffMs", env.telegramPollingRetryBackoffMs),
      },
      delivery: {
        maxRetries: readIntegerEnv("telegramDeliveryMaxRetries", env.telegramDeliveryMaxRetries),
        baseDelayMs: readIntegerEnv("telegramDeliveryBaseDelayMs", env.telegramDeliveryBaseDelayMs),
        maxDelayMs: readIntegerEnv("telegramDeliveryMaxDelayMs", env.telegramDeliveryMaxDelayMs),
      },
      messageChunkChars: readIntegerEnv("telegramMessageChunkChars", env.telegramMessageChunkChars),
      typingIntervalMs: readIntegerEnv("telegramTypingIntervalMs", env.telegramTypingIntervalMs),
    },
    weixin: {
      baseUrl: env.weixinBaseUrl,
      cdnBaseUrl: env.weixinCdnBaseUrl,
      allowedUserIds: weixinAllowedUserIds,
      pollingTimeoutMs: readIntegerEnv("weixinPollingTimeoutMs", env.weixinPollingTimeoutMs),
      pollingRetryBackoffMs: readIntegerEnv("weixinPollingRetryBackoffMs", env.weixinPollingRetryBackoffMs),
      messageChunkBytes: readIntegerEnv("weixinMessageChunkBytes", env.weixinMessageChunkBytes),
      typingIntervalMs: readIntegerEnv("weixinTypingIntervalMs", env.weixinTypingIntervalMs),
      qrTimeoutMs: readIntegerEnv("weixinQrTimeoutMs", env.weixinQrTimeoutMs),
      routeTag: env.weixinRouteTag,
    },
    extensions: readExtensionEnv(),
  });

  if (!merged.profile) {
    throw missingConfigValue(
      "KITTY_PROFILE",
      "Missing agent profile. Set KITTY_PROFILE explicitly in the project's .kitty/.env file.",
    );
  }
  resolveAgentProfile(merged.profile);

  return {
    ...merged,
    apiKey: env.apiKey,
    paths,
    telegram: resolveTelegramRuntimeConfig(merged.telegram, projectRoots.stateRootDir),
    weixin: resolveWeixinRuntimeConfig(merged.weixin, projectRoots.stateRootDir),
  };
}

function readRuntimeEnv(): Record<keyof typeof KITTY_BASE_ENV, string> {
  return Object.fromEntries(
    Object.entries(KITTY_BASE_ENV).map(([name, key]) => [name, process.env[key] ?? ""]),
  ) as Record<keyof typeof KITTY_BASE_ENV, string>;
}

function readExtensionEnv() {
  return Object.fromEntries(
    EXTENSION_IDS.map((id) => [id, readBooleanValue(KITTY_ENV.extensions[id], process.env[KITTY_ENV.extensions[id]] ?? "")]),
  ) as Record<(typeof EXTENSION_IDS)[number], boolean>;
}

function readIntegerEnv(name: keyof typeof KITTY_BASE_ENV, value: string): number {
  const parsed = parseIntegerEnv(value);
  if (parsed === undefined) {
    throw invalidConfigValue(
      KITTY_BASE_ENV[name],
      `Missing or invalid ${KITTY_BASE_ENV[name]} in the project's .kitty/.env file.`,
    );
  }
  return parsed;
}

function readBooleanEnv(name: keyof typeof KITTY_BASE_ENV, value: string): boolean {
  return readBooleanValue(KITTY_BASE_ENV[name], value);
}

function readBooleanValue(envKey: string, value: string): boolean {
  const parsed = parseBooleanEnv(value);
  if (parsed === undefined) {
    throw invalidConfigValue(
      envKey,
      `Missing or invalid ${envKey} in the project's .kitty/.env file.`,
    );
  }
  return parsed;
}
