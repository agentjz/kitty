import fs from "node:fs/promises";
import path from "node:path";

import type { MediaRuntimeConfig } from "../types.js";
import { ensureProjectStateDirectories } from "../project/statePaths.js";
import { atomicWriteFile } from "../utils/fs.js";
import { inspectMediaArtifact, resolveMediaOutputPath } from "./artifacts.js";
import { resolveMediaProvider } from "./catalog.js";
import { downloadMedia, MediaProviderError, requestMediaJson } from "./http.js";
import {
  buildAgnesImageRequest,
  buildAgnesVideoCreateRequest,
  buildAgnesVideoPollRequest,
  normalizeAgnesImageResponse,
  normalizeAgnesVideoCreateResponse,
  normalizeAgnesVideoPollResponse,
} from "./providers/agnes.js";

export interface MediaArtifactSaveResult {
  bytes: number;
  mimeType: string;
  changeId?: string;
  changeHistoryWarning?: string;
}

export type MediaArtifactWriter = (input: {
  outputPath: string;
  bytes: Buffer;
  kind: "image" | "video";
}) => Promise<MediaArtifactSaveResult>;

export interface GeneratedImageResult {
  mediaType: "image";
  status: "completed";
  provider: string;
  model: string;
  path: string;
  bytes: number;
  contentType: string;
  changeId?: string;
  changeHistoryWarning?: string;
}

export interface VideoGenerationResult {
  operation: "create" | "poll";
  videoId: string;
  status: "queued" | "in_progress" | "waiting" | "completed";
  progress?: number;
  seconds?: string;
  size?: string;
  nextPollAt?: string;
  retryAfterMs?: number;
  path?: string;
  bytes?: number;
  contentType?: string;
  changeId?: string;
  changeHistoryWarning?: string;
}

interface VideoTaskRecord {
  videoId: string;
  status: string;
  model: string;
  outputPath?: string;
  nextPollAt: string;
  updatedAt: string;
}

export async function generateMediaImage(input: {
  config: MediaRuntimeConfig;
  cwd: string;
  prompt: string;
  size?: string;
  ratio?: string;
  images?: string[];
  outputPath?: string;
  responseFormat?: "url" | "b64_json";
  signal?: AbortSignal;
  saveArtifact: MediaArtifactWriter;
}): Promise<GeneratedImageResult> {
  const provider = resolveMediaProvider(input.config.provider);
  if (!provider.imageModels.includes(input.config.imageModel)) {
    throw new Error(`Unsupported image model for ${provider.id}: ${input.config.imageModel}.`);
  }
  const models = [input.config.imageModel];
  if (provider.imageFallbackModel && provider.imageFallbackModel !== input.config.imageModel) {
    models.push(provider.imageFallbackModel);
  }
  let response: { model: string; payload: unknown } | undefined;
  for (const [index, model] of models.entries()) {
    const request = buildAgnesImageRequest({
      baseUrl: input.config.baseUrl,
      apiKey: input.config.apiKey,
      model,
      prompt: input.prompt,
      size: input.size ?? "1K",
      ratio: input.ratio ?? "1:1",
      images: input.images,
      responseFormat: input.responseFormat ?? "url",
    });
    try {
      response = {
        model,
        payload: await requestMediaJson(request, {
          timeoutMs: input.config.requestTimeoutMs,
          signal: input.signal,
          retryResponseStatuses: [408, 429, 502, 503, 504, 520, 522, 524],
          maxAttempts: 2,
        }),
      };
      break;
    } catch (error) {
      const canFallback = error instanceof MediaProviderError && error.status === 503 && index + 1 < models.length;
      if (!canFallback) throw error;
    }
  }
  if (!response) throw new Error("Agnes image generation failed without a provider response.");
  const result = normalizeAgnesImageResponse(response.payload);
  const downloaded = result.kind === "url"
    ? await downloadMedia({ endpoint: result.url!, method: "GET", headers: {} }, {
      timeoutMs: input.config.requestTimeoutMs,
      signal: input.signal,
      maxBytes: 50_000_000,
      retryGet: true,
    })
    : { bytes: decodeBase64Image(result.base64!) };
  const inspection = inspectMediaArtifact(downloaded.bytes, "image");
  const outputPath = resolveMediaOutputPath(input.cwd, input.outputPath, inspection.extension);
  const artifact = await input.saveArtifact({ outputPath, bytes: downloaded.bytes, kind: "image" });
  return compact({
    mediaType: "image",
    status: "completed",
    provider: provider.id,
    model: response.model,
    path: outputPath,
    bytes: artifact.bytes,
    contentType: artifact.mimeType,
    changeId: artifact.changeId,
    changeHistoryWarning: artifact.changeHistoryWarning,
  }) as GeneratedImageResult;
}

export async function createMediaVideo(input: {
  config: MediaRuntimeConfig;
  stateRootDir: string;
  prompt: string;
  image?: string;
  keyframes?: string[];
  width?: number;
  height?: number;
  numFrames?: number;
  frameRate?: number;
  seed?: number;
  negativePrompt?: string;
  outputPath?: string;
  signal?: AbortSignal;
}): Promise<VideoGenerationResult> {
  const provider = resolveMediaProvider(input.config.provider);
  if (!provider.videoModels.includes(input.config.videoModel)) {
    throw new Error(`Unsupported video model for ${provider.id}: ${input.config.videoModel}.`);
  }
  const request = buildAgnesVideoCreateRequest({
    baseUrl: input.config.baseUrl,
    apiKey: input.config.apiKey,
    model: input.config.videoModel,
    prompt: input.prompt,
    image: input.image,
    keyframes: input.keyframes,
    width: input.width,
    height: input.height,
    numFrames: input.numFrames,
    frameRate: input.frameRate,
    seed: input.seed,
    negativePrompt: input.negativePrompt,
  });
  const result = normalizeAgnesVideoCreateResponse(await requestMediaJson(request, {
    timeoutMs: input.config.requestTimeoutMs,
    signal: input.signal,
  }));
  const now = Date.now();
  const record: VideoTaskRecord = {
    videoId: result.videoId,
    status: result.status,
    model: input.config.videoModel,
    outputPath: input.outputPath,
    nextPollAt: new Date(now + input.config.pollIntervalMs).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  await saveVideoTask(input.stateRootDir, record);
  return compact({
    operation: "create",
    videoId: result.videoId,
    status: result.status,
    progress: result.progress,
    seconds: result.seconds,
    size: result.size,
    nextPollAt: record.nextPollAt,
  }) as VideoGenerationResult;
}

export async function pollMediaVideo(input: {
  config: MediaRuntimeConfig;
  cwd: string;
  stateRootDir: string;
  videoId: string;
  waitSeconds?: number;
  outputPath?: string;
  signal?: AbortSignal;
  saveArtifact: MediaArtifactWriter;
}): Promise<VideoGenerationResult> {
  const provider = resolveMediaProvider(input.config.provider);
  if (!provider.videoModels.includes(input.config.videoModel)) {
    throw new Error(`Unsupported video model for ${provider.id}: ${input.config.videoModel}.`);
  }
  const request = buildAgnesVideoPollRequest(input.config.baseUrl, input.config.apiKey, input.videoId);
  const record = await loadVideoTask(input.stateRootDir, input.videoId);
  const waitSeconds = Math.max(0, Math.min(60, input.waitSeconds ?? 0));
  if (waitSeconds > 0) await abortableWait(waitSeconds * 1_000, input.signal);
  const now = Date.now();
  if (record && Date.parse(record.nextPollAt) > now) {
    return {
      operation: "poll",
      videoId: input.videoId,
      status: "waiting",
      retryAfterMs: Date.parse(record.nextPollAt) - now,
      nextPollAt: record.nextPollAt,
    };
  }
  const result = normalizeAgnesVideoPollResponse(await requestMediaJson(request, {
    timeoutMs: input.config.requestTimeoutMs,
    signal: input.signal,
    retryGet: true,
  }), input.videoId);
  const nextPollAt = new Date(Date.now() + input.config.pollIntervalMs).toISOString();
  const requestedOutputPath = input.outputPath ?? record?.outputPath;
  await saveVideoTask(input.stateRootDir, {
    videoId: input.videoId,
    status: result.status,
    model: input.config.videoModel,
    outputPath: requestedOutputPath,
    nextPollAt,
    updatedAt: new Date().toISOString(),
  });
  if (result.status === "failed") {
    throw new Error(`Agnes video generation failed: ${JSON.stringify(result.error ?? "unknown provider error")}`);
  }
  if (result.status !== "completed") {
    return compact({
      operation: "poll",
      videoId: input.videoId,
      status: result.status,
      progress: result.progress,
      seconds: result.seconds,
      size: result.size,
      nextPollAt,
    }) as VideoGenerationResult;
  }
  if (!result.url) throw new Error("Completed Agnes video response did not contain a download URL.");
  const downloaded = await downloadMedia({ endpoint: result.url, method: "GET", headers: {} }, {
    timeoutMs: input.config.requestTimeoutMs,
    signal: input.signal,
    maxBytes: 1_000_000_000,
    retryGet: true,
  });
  const inspection = inspectMediaArtifact(downloaded.bytes, "video");
  const outputPath = resolveMediaOutputPath(input.cwd, requestedOutputPath, inspection.extension);
  const artifact = await input.saveArtifact({ outputPath, bytes: downloaded.bytes, kind: "video" });
  await saveVideoTask(input.stateRootDir, {
    videoId: input.videoId,
    status: "completed",
    model: input.config.videoModel,
    outputPath,
    nextPollAt,
    updatedAt: new Date().toISOString(),
  });
  return compact({
    operation: "poll",
    videoId: input.videoId,
    status: "completed",
    seconds: result.seconds,
    size: result.size,
    path: outputPath,
    bytes: artifact.bytes,
    contentType: artifact.mimeType,
    changeId: artifact.changeId,
    changeHistoryWarning: artifact.changeHistoryWarning,
  }) as VideoGenerationResult;
}

async function videoTaskPath(root: string, videoId: string): Promise<string> {
  const paths = await ensureProjectStateDirectories(root);
  const mediaDir = path.join(paths.capabilitiesDir, "media", "video-tasks");
  return path.join(mediaDir, `${sanitizeStateSegment(videoId)}.json`);
}

async function saveVideoTask(root: string, record: VideoTaskRecord): Promise<void> {
  const filePath = await videoTaskPath(root, record.videoId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWriteFile(filePath, `${JSON.stringify(record, null, 2)}\n`);
}

async function loadVideoTask(root: string, videoId: string): Promise<VideoTaskRecord | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(await videoTaskPath(root, videoId), "utf8")) as unknown;
    if (!isVideoTaskRecord(parsed) || parsed.videoId !== videoId) throw new Error(`Stored Agnes video task is invalid: ${videoId}.`);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function decodeBase64Image(value: string): Buffer {
  const encoded = value.replace(/^data:[^;,]+;base64,/u, "");
  if (encoded.length > 67_000_000 || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) {
    throw new Error("Agnes returned invalid Base64 image data.");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length) throw new Error("Agnes returned invalid Base64 image data.");
  return bytes;
}

function sanitizeStateSegment(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/gu, "_"); }

async function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isVideoTaskRecord(value: unknown): value is VideoTaskRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<VideoTaskRecord>;
  return typeof record.videoId === "string" && typeof record.status === "string" &&
    typeof record.model === "string" && typeof record.nextPollAt === "string" &&
    Number.isFinite(Date.parse(record.nextPollAt)) && typeof record.updatedAt === "string" &&
    Number.isFinite(Date.parse(record.updatedAt)) &&
    (record.outputPath === undefined || typeof record.outputPath === "string");
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
