import path from "node:path";

import { invalidConfigValue, missingConfigValue } from "./errors.js";
import { getProjectStatePaths } from "../project/statePaths.js";

export interface TelegramConfig {
  token: string;
  apiBaseUrl: string;
  proxyUrl: string;
  allowedUserIds: number[];
  polling: {
    timeoutSeconds: number;
    limit: number;
    retryBackoffMs: number;
  };
  delivery: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  messageChunkChars: number;
  typingIntervalMs: number;
}

export interface TelegramRuntimeConfig extends TelegramConfig {
  stateDir: string;
}

export interface WeixinConfig {
  baseUrl: string;
  cdnBaseUrl: string;
  allowedUserIds: string[];
  pollingTimeoutMs: number;
  pollingRetryBackoffMs: number;
  messageChunkBytes: number;
  typingIntervalMs: number;
  qrTimeoutMs: number;
  routeTag: string;
}

export interface WeixinRuntimeConfig extends WeixinConfig {
  stateDir: string;
  credentialsFile: string;
  syncBufFile: string;
  sessionMapFile: string;
  attachmentStoreFile: string;
  contextTokenFile: string;
}

export const INITIAL_WEIXIN_CONFIG: WeixinConfig = {
  baseUrl: "https://ilinkai.weixin.qq.com",
  cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
  allowedUserIds: [],
  pollingTimeoutMs: 30_000,
  pollingRetryBackoffMs: 1_000,
  messageChunkBytes: 3_500,
  typingIntervalMs: 4_000,
  qrTimeoutMs: 480_000,
  routeTag: "",
};

export function normalizeWeixinConfig(config: Partial<WeixinConfig> = {}): WeixinConfig {
  return {
    baseUrl: normalizeUrl(config.baseUrl, INITIAL_WEIXIN_CONFIG.baseUrl),
    cdnBaseUrl: normalizeUrl(config.cdnBaseUrl, INITIAL_WEIXIN_CONFIG.cdnBaseUrl),
    allowedUserIds: normalizeStringIds(config.allowedUserIds),
    pollingTimeoutMs: clampNumber(config.pollingTimeoutMs ?? INITIAL_WEIXIN_CONFIG.pollingTimeoutMs, 1_000, 120_000, "weixin.pollingTimeoutMs"),
    pollingRetryBackoffMs: clampNumber(config.pollingRetryBackoffMs ?? INITIAL_WEIXIN_CONFIG.pollingRetryBackoffMs, 250, 60_000, "weixin.pollingRetryBackoffMs"),
    messageChunkBytes: clampNumber(config.messageChunkBytes ?? INITIAL_WEIXIN_CONFIG.messageChunkBytes, 128, 12_000, "weixin.messageChunkBytes"),
    typingIntervalMs: clampNumber(config.typingIntervalMs ?? INITIAL_WEIXIN_CONFIG.typingIntervalMs, 500, 60_000, "weixin.typingIntervalMs"),
    qrTimeoutMs: clampNumber(config.qrTimeoutMs ?? INITIAL_WEIXIN_CONFIG.qrTimeoutMs, 30_000, 900_000, "weixin.qrTimeoutMs"),
    routeTag: String(config.routeTag ?? INITIAL_WEIXIN_CONFIG.routeTag).trim(),
  };
}

export function resolveWeixinRuntimeConfig(config: Partial<WeixinConfig> | undefined, stateRootDir: string): WeixinRuntimeConfig {
  const normalized = normalizeWeixinConfig(config);
  const stateDir = path.join(getProjectStatePaths(stateRootDir).kittyDir, "weixin");
  return {
    ...normalized,
    stateDir,
    credentialsFile: path.join(stateDir, "credentials.json"),
    syncBufFile: path.join(stateDir, "sync-buf.json"),
    sessionMapFile: path.join(stateDir, "session-map.json"),
    attachmentStoreFile: path.join(stateDir, "attachments.json"),
    contextTokenFile: path.join(stateDir, "context-tokens.json"),
  };
}

export function parseWeixinAllowedUserIds(raw: string | undefined): string[] {
  return normalizeStringIds(raw?.split(/[,\r\n]+/u));
}

export const INITIAL_TELEGRAM_CONFIG: TelegramConfig = {
  token: "",
  apiBaseUrl: "https://api.telegram.org",
  proxyUrl: "",
  allowedUserIds: [],
  polling: {
    timeoutSeconds: 50,
    limit: 100,
    retryBackoffMs: 1_000,
  },
  delivery: {
    maxRetries: 6,
    baseDelayMs: 1_000,
    maxDelayMs: 30_000,
  },
  messageChunkChars: 3_500,
  typingIntervalMs: 4_000,
};

export function normalizeTelegramConfig(config: Partial<TelegramConfig> = {}): TelegramConfig {
  return {
    token: String(config.token ?? "").trim(),
    apiBaseUrl: normalizeApiBaseUrl(config.apiBaseUrl),
    proxyUrl: normalizeProxyUrl(config.proxyUrl),
    allowedUserIds: normalizeAllowedUserIds(config.allowedUserIds),
    polling: {
      timeoutSeconds: clampNumber(
        config.polling?.timeoutSeconds,
        1,
        50,
        "telegram.polling.timeoutSeconds",
      ),
      limit: clampNumber(config.polling?.limit, 1, 100, "telegram.polling.limit"),
      retryBackoffMs: clampNumber(
        config.polling?.retryBackoffMs,
        250,
        60_000,
        "telegram.polling.retryBackoffMs",
      ),
    },
    delivery: {
      maxRetries: clampNumber(config.delivery?.maxRetries, 1, 32, "telegram.delivery.maxRetries"),
      baseDelayMs: clampNumber(
        config.delivery?.baseDelayMs,
        250,
        120_000,
        "telegram.delivery.baseDelayMs",
      ),
      maxDelayMs: clampNumber(
        config.delivery?.maxDelayMs,
        1_000,
        120_000,
        "telegram.delivery.maxDelayMs",
      ),
    },
    messageChunkChars: clampNumber(
      config.messageChunkChars,
      128,
      4_096,
      "telegram.messageChunkChars",
    ),
    typingIntervalMs: clampNumber(
      config.typingIntervalMs,
      500,
      60_000,
      "telegram.typingIntervalMs",
    ),
  };
}

export function resolveTelegramRuntimeConfig(
  config: Partial<TelegramConfig> | undefined,
  stateRootDir: string,
): TelegramRuntimeConfig {
  const normalized = normalizeTelegramConfig(config);
  return {
    ...normalized,
    stateDir: path.join(getProjectStatePaths(stateRootDir).kittyDir, "telegram"),
  };
}

export function parseTelegramAllowedUserIds(raw: string | undefined): number[] {
  if (!raw) {
    return [];
  }

  return normalizeAllowedUserIds(
    raw
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value)),
  );
}

function normalizeApiBaseUrl(raw: string | undefined): string {
  const value = String(raw ?? "").trim().replace(/\/+$/u, "");
  if (!value) {
    throw missingConfigValue("telegram.apiBaseUrl", "Missing Telegram API base URL.");
  }
  return value;
}

function normalizeProxyUrl(raw: string | undefined): string {
  const value = String(raw ?? "").trim();
  return value.replace(/\/+$/u, "");
}

function normalizeUrl(raw: string | undefined, fallback: string): string {
  return String(raw ?? fallback).trim().replace(/\/+$/u, "") || fallback;
}

function normalizeStringIds(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeAllowedUserIds(values: readonly number[] | undefined): number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<number>();
  for (const value of values) {
    const normalized = Number.isFinite(value) ? Math.trunc(value) : Number.NaN;
    if (Number.isFinite(normalized) && normalized > 0) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function clampNumber(value: number | undefined, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidConfigValue(name, `Missing or invalid config value: ${name}.`);
  }

  const normalized = Math.trunc(value);
  return Math.max(min, Math.min(max, normalized));
}
