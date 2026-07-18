import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { atomicWriteFile } from "../utils/fs.js";

export interface MediaArtifactInspection {
  extension: ".png" | ".jpg" | ".webp" | ".mp4" | ".webm";
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "video/mp4" | "video/webm";
}

export function resolveMediaOutputPath(cwd: string, requested: string | undefined, extension: MediaArtifactInspection["extension"]): string {
  const relative = requested?.trim() || path.join("generated", "kitty", `${Date.now()}-${crypto.randomUUID()}${extension}`);
  const resolved = path.resolve(cwd, relative);
  const boundary = path.relative(cwd, resolved);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new Error("Generated media output must stay inside the project directory.");
  return resolved;
}

export async function writeMediaArtifact(targetPath: string, bytes: Buffer, kind: "image" | "video"): Promise<{ bytes: number; mimeType: string }> {
  if (bytes.length === 0) throw new Error("Generated media response was empty.");
  const inspection = inspectMediaArtifact(bytes, kind);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await atomicWriteFile(targetPath, bytes);
  return { bytes: bytes.length, mimeType: inspection.mimeType };
}

export function inspectMediaArtifact(bytes: Buffer, kind: "image" | "video"): MediaArtifactInspection {
  if (kind === "image") {
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return { extension: ".png", mimeType: "image/png" };
    }
    if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
      return { extension: ".jpg", mimeType: "image/jpeg" };
    }
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
      return { extension: ".webp", mimeType: "image/webp" };
    }
    throw new Error("Generated image response is not a recognized PNG, JPEG, or WebP file.");
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    return { extension: ".mp4", mimeType: "video/mp4" };
  }
  if (bytes.subarray(0, 4).toString("hex") === "1a45dfa3") {
    return { extension: ".webm", mimeType: "video/webm" };
  }
  throw new Error("Generated video response is not a recognized MP4 or WebM file.");
}
