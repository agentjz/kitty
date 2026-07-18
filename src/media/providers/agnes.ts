export interface MediaHttpRequest {
  endpoint: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

const IMAGE_RATIOS = new Set(["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"]);
const VIDEO_STATUSES = new Set(["queued", "in_progress", "completed", "failed"]);

export function buildAgnesImageRequest(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  ratio?: string;
  images?: string[];
  responseFormat: "url" | "b64_json";
}): MediaHttpRequest {
  if (!input.prompt.trim()) throw new Error("Image prompt must not be empty.");
  if (!/^\d+K$|^\d+x\d+$/u.test(input.size)) throw new Error("Image size must be a supported tier or WxH value.");
  if (input.ratio && !IMAGE_RATIOS.has(input.ratio)) throw new Error(`Unsupported image ratio: ${input.ratio}.`);
  if (input.images && (input.images.length < 1 || input.images.length > 8)) throw new Error("Image input must contain 1 to 8 references.");
  input.images?.forEach((image) => assertImageReference(image, "Image reference"));
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    size: input.size,
    extra_body: { response_format: input.responseFormat },
  };
  if (input.ratio) body.ratio = input.ratio;
  if (input.images?.length) (body.extra_body as Record<string, unknown>).image = input.images;
  return {
    endpoint: `${trimBaseUrl(input.baseUrl)}/images/generations`,
    method: "POST",
    headers: bearerHeaders(input.apiKey),
    body: JSON.stringify(body),
  };
}

export function buildAgnesVideoCreateRequest(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  image?: string;
  keyframes?: string[];
  mode?: "ti2vid" | "keyframes";
  width?: number;
  height?: number;
  numFrames?: number;
  frameRate?: number;
  seed?: number;
  negativePrompt?: string;
}): MediaHttpRequest {
  if (!input.prompt.trim()) throw new Error("Video prompt must not be empty.");
  if (input.image && input.keyframes?.length) throw new Error("Video image and keyframes are mutually exclusive.");
  if (input.image) assertImageReference(input.image, "Video image");
  if (input.keyframes && (input.keyframes.length < 1 || input.keyframes.length > 2)) throw new Error("Video keyframes must contain 1 or 2 references.");
  input.keyframes?.forEach((image) => assertImageReference(image, "Video keyframe"));
  const width = input.width ?? 1152;
  const height = input.height ?? 768;
  const numFrames = input.numFrames ?? 81;
  const frameRate = input.frameRate ?? 24;
  if (!Number.isInteger(width) || width < 64 || width % 64 !== 0) throw new Error("Video width must be a multiple of 64.");
  if (!Number.isInteger(height) || height < 64 || height % 64 !== 0) throw new Error("Video height must be a multiple of 64.");
  if (!Number.isInteger(numFrames) || numFrames < 9 || numFrames > 441 || (numFrames - 1) % 8 !== 0) throw new Error("Video num_frames must be <= 441 and follow 8n + 1.");
  if (!Number.isFinite(frameRate) || frameRate < 1 || frameRate > 60) throw new Error("Video frame_rate must be between 1 and 60.");
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    width,
    height,
    num_frames: numFrames,
    frame_rate: frameRate,
  };
  if (input.seed !== undefined) {
    if (!Number.isSafeInteger(input.seed)) throw new Error("Video seed must be a safe integer.");
    body.seed = input.seed;
  }
  if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
  if (input.image) body.image = input.image;
  if (input.keyframes?.length) {
    body.extra_body = { image: input.keyframes, mode: input.mode ?? "keyframes" };
  } else if (input.mode) {
    body.extra_body = { mode: input.mode };
  }
  return {
    endpoint: `${trimBaseUrl(input.baseUrl)}/videos`,
    method: "POST",
    headers: bearerHeaders(input.apiKey),
    body: JSON.stringify(body),
  };
}

export function buildAgnesVideoPollUrl(baseUrl: string, videoId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u.test(videoId)) throw new Error("video_id must be a valid Agnes video identifier.");
  const url = new URL(trimBaseUrl(baseUrl));
  url.pathname = "/agnesapi";
  url.search = new URLSearchParams({ video_id: videoId }).toString();
  return url.toString();
}

export function buildAgnesVideoPollRequest(baseUrl: string, apiKey: string, videoId: string): MediaHttpRequest {
  return { endpoint: buildAgnesVideoPollUrl(baseUrl, videoId), method: "GET", headers: bearerHeaders(apiKey) };
}

export function normalizeAgnesImageResponse(payload: unknown): { kind: "url" | "base64"; url?: string; base64?: string } {
  const root = asRecord(payload);
  const item = Array.isArray(root?.data) ? asRecord(root.data[0]) : root;
  const url = readHttpUrl(item?.url) ?? readHttpUrl(root?.url);
  const base64 = readNonEmpty(item?.b64_json) ?? readNonEmpty(root?.b64_json);
  if (url) return { kind: "url", url };
  if (base64) return { kind: "base64", base64 };
  throw new Error("Agnes image response did not contain a URL or Base64 image.");
}

export interface AgnesVideoResponse {
  videoId: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  seconds?: string;
  size?: string;
  url?: string;
  error?: unknown;
}

export function normalizeAgnesVideoCreateResponse(payload: unknown): AgnesVideoResponse {
  return normalizeAgnesVideoPayload(payload, undefined, true);
}

export function normalizeAgnesVideoPollResponse(payload: unknown, expectedVideoId: string): AgnesVideoResponse {
  return normalizeAgnesVideoPayload(payload, expectedVideoId, false);
}

function normalizeAgnesVideoPayload(payload: unknown, expectedVideoId: string | undefined, requireVideoIdField: boolean): AgnesVideoResponse {
  const root = asRecord(payload);
  const data = Array.isArray(root?.data) ? asRecord(root.data[0]) : undefined;
  const source = data ?? root;
  const responseVideoId = readNonEmpty(source?.video_id);
  const responseId = readNonEmpty(source?.id);
  if (requireVideoIdField && !responseVideoId) throw new Error("Agnes video create response did not contain video_id.");
  if (expectedVideoId && responseVideoId && responseVideoId !== expectedVideoId) throw new Error("Agnes video poll response video_id did not match the requested video_id.");
  if (expectedVideoId && responseId && responseId !== expectedVideoId) throw new Error("Agnes video poll response id did not match the requested video_id.");
  const videoId = expectedVideoId ?? responseVideoId;
  const status = readNonEmpty(source?.status);
  if (!videoId) throw new Error("Agnes video response did not identify the requested video.");
  if (!status || !VIDEO_STATUSES.has(status)) throw new Error(`Agnes video response has unsupported status: ${status ?? "missing"}.`);
  return compact({
    videoId,
    status: status as AgnesVideoResponse["status"],
    progress: typeof source?.progress === "number" ? source.progress : undefined,
    seconds: readNonEmpty(source?.seconds),
    size: readNonEmpty(source?.size),
    url: readHttpUrl(source?.url),
    error: source?.error,
  }) as AgnesVideoResponse;
}

function bearerHeaders(apiKey: string): Record<string, string> {
  if (!apiKey.trim()) throw new Error("Agnes media API key is missing.");
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function trimBaseUrl(value: string): string { return value.replace(/\/+$/u, ""); }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readNonEmpty(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }
function readHttpUrl(value: unknown): string | undefined {
  const text = readNonEmpty(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
function assertImageReference(value: string, label: string): void {
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/iu.test(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return;
  } catch {
    // Fall through to the contract error.
  }
  throw new Error(`${label} must be an HTTP(S) URL or image Data URI.`);
}
function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
