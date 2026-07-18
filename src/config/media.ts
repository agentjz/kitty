import { invalidConfigValue, missingConfigValue } from "./errors.js";
import type { MediaConfig } from "../types.js";
import { resolveMediaProvider } from "../media/catalog.js";

export const DEFAULT_MEDIA_CONFIG: MediaConfig = {
  provider: "agnes",
  baseUrl: "https://apihub.agnes-ai.com/v1",
  imageModel: "agnes-image-2.1-flash",
  videoModel: "agnes-video-v2.0",
  requestTimeoutMs: 10 * 60 * 1000,
  pollIntervalMs: 15_000,
};

export function normalizeMediaConfig(input: {
  provider: unknown;
  baseUrl: unknown;
  imageModel: unknown;
  videoModel: unknown;
  requestTimeoutMs: unknown;
  pollIntervalMs: unknown;
}): MediaConfig {
  const provider = requireText(input.provider, "KITTY_MEDIA_PROVIDER");
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const imageModel = requireText(input.imageModel, "KITTY_MEDIA_IMAGE_MODEL");
  const videoModel = requireText(input.videoModel, "KITTY_MEDIA_VIDEO_MODEL");
  const requestTimeoutMs = boundedInteger(input.requestTimeoutMs, 10_000, 15 * 60 * 1000, "KITTY_MEDIA_REQUEST_TIMEOUT_MS");
  const pollIntervalMs = boundedInteger(input.pollIntervalMs, 5_000, 60_000, "KITTY_MEDIA_POLL_INTERVAL_MS");
  const profile = resolveMediaProvider(provider);
  if (!profile.imageModels.includes(imageModel)) throw invalidConfigValue("KITTY_MEDIA_IMAGE_MODEL", `Unknown image model for ${provider}: ${imageModel}.`);
  if (!profile.videoModels.includes(videoModel)) throw invalidConfigValue("KITTY_MEDIA_VIDEO_MODEL", `Unknown video model for ${provider}: ${videoModel}.`);
  return { provider, baseUrl, imageModel, videoModel, requestTimeoutMs, pollIntervalMs };
}

function normalizeBaseUrl(value: unknown): string {
  const baseUrl = requireText(value, "KITTY_MEDIA_BASE_URL").replace(/\/+$/u, "");
  try {
    const parsed = new URL(baseUrl);
    if (!/^https?:$/u.test(parsed.protocol)) throw new Error("unsupported protocol");
  } catch {
    throw invalidConfigValue("KITTY_MEDIA_BASE_URL", "Media base URL must be a valid HTTP(S) URL.");
  }
  return baseUrl;
}

function requireText(value: unknown, key: string): string {
  const result = String(value ?? "").trim();
  if (!result) throw missingConfigValue(key);
  return result;
}

function boundedInteger(value: unknown, min: number, max: number, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidConfigValue(key, `Missing or invalid ${key}.`);
  }
  const integer = Math.trunc(value);
  if (integer < min || integer > max) {
    throw invalidConfigValue(key, `${key} must be between ${min} and ${max}.`);
  }
  return integer;
}
