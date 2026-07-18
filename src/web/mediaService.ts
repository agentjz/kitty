import fs from "node:fs/promises";
import path from "node:path";

import type { MediaRuntimeConfig } from "../types.js";
import { inspectMediaArtifact, writeMediaArtifact } from "../media/artifacts.js";
import { createMediaVideo, generateMediaImage, pollMediaVideo } from "../media/generation.js";

const IMAGE_SIZES = new Set(["1K", "2K", "3K", "4K"]);
const IMAGE_RATIOS = new Set(["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"]);

export interface WebMediaArtifact {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}

export class WebMediaService {
  constructor(private readonly cwd: string, private readonly stateRootDir: string) {}

  async generateImage(config: MediaRuntimeConfig, body: Record<string, unknown>, signal?: AbortSignal) {
    const prompt = requiredText(body.prompt, "prompt", 8_000);
    const size = optionalChoice(body.size, IMAGE_SIZES, "size") ?? "1K";
    const ratio = optionalChoice(body.ratio, IMAGE_RATIOS, "ratio") ?? "1:1";
    const result = await generateMediaImage({
      config,
      cwd: this.cwd,
      prompt,
      size,
      ratio,
      responseFormat: "url",
      signal,
      saveArtifact: ({ outputPath, bytes, kind }) => writeMediaArtifact(outputPath, bytes, kind),
    });
    return this.projectResult(result);
  }

  async createVideo(config: MediaRuntimeConfig, body: Record<string, unknown>, signal?: AbortSignal) {
    const prompt = requiredText(body.prompt, "prompt", 8_000);
    const result = await createMediaVideo({
      config,
      stateRootDir: this.stateRootDir,
      prompt,
      width: optionalNumber(body.width, "width"),
      height: optionalNumber(body.height, "height"),
      numFrames: optionalNumber(body.numFrames, "numFrames"),
      frameRate: optionalNumber(body.frameRate, "frameRate"),
      seed: optionalNumber(body.seed, "seed"),
      negativePrompt: optionalText(body.negativePrompt, "negativePrompt", 4_000),
      signal,
    });
    return this.projectResult(result);
  }

  async pollVideo(config: MediaRuntimeConfig, videoId: string, body: Record<string, unknown>, signal?: AbortSignal) {
    const result = await pollMediaVideo({
      config,
      cwd: this.cwd,
      stateRootDir: this.stateRootDir,
      videoId: requiredText(videoId, "video_id", 256),
      waitSeconds: optionalNumber(body.waitSeconds, "waitSeconds"),
      signal,
      saveArtifact: ({ outputPath, bytes, kind }) => writeMediaArtifact(outputPath, bytes, kind),
    });
    return this.projectResult(result);
  }

  async readArtifact(relativePath: string): Promise<WebMediaArtifact> {
    const generatedRoot = path.resolve(this.cwd, "generated", "kitty");
    const candidate = path.resolve(this.cwd, relativePath);
    const candidateRelative = path.relative(generatedRoot, candidate);
    if (!relativePath || path.isAbsolute(relativePath) || candidateRelative.startsWith("..") || path.isAbsolute(candidateRelative)) {
      throw new Error("Media artifact path must stay inside generated/kitty.");
    }
    const [realRoot, realFile] = await Promise.all([fs.realpath(generatedRoot), fs.realpath(candidate)]);
    const realRelative = path.relative(realRoot, realFile);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Media artifact path must stay inside generated/kitty.");
    const bytes = await fs.readFile(realFile);
    const extension = path.extname(realFile).toLowerCase();
    const kind = extension === ".mp4" || extension === ".webm" ? "video" : "image";
    const inspection = inspectMediaArtifact(bytes, kind);
    return { bytes, mimeType: inspection.mimeType, fileName: path.basename(realFile) };
  }

  private projectResult<T extends { path?: string }>(result: T): T {
    if (!result.path) return result;
    return { ...result, path: path.relative(this.cwd, result.path).replace(/\\/gu, "/") };
  }
}

function requiredText(value: unknown, key: string, maxLength: number): string {
  const text = optionalText(value, key, maxLength);
  if (!text) throw new Error(`${key} must not be empty.`);
  return text;
}

function optionalText(value: unknown, key: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be text.`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${key} exceeds ${maxLength} characters.`);
  return text || undefined;
}

function optionalChoice(value: unknown, choices: ReadonlySet<string>, key: string): string | undefined {
  const text = optionalText(value, key, 32);
  if (text && !choices.has(text)) throw new Error(`${key} is not supported.`);
  return text;
}

function optionalNumber(value: unknown, key: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number.`);
  return value;
}
