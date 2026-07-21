import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";

export interface BashOutputCapture {
  outputPreview: string;
  outputPath?: string;
  truncated: boolean;
  outputChars: number;
  outputBytes: number;
}

export interface BashOutputCaptureAppender {
  append(chunk: string): void;
  finalize(): Promise<BashOutputCapture>;
}

export const DEFAULT_BASH_OUTPUT_PREVIEW_CHARS = 48_000;

export async function createBashOutputCapture(input: {
  stateRootDir?: string;
  sessionId?: string;
  maxPreviewChars?: number;
}): Promise<BashOutputCaptureAppender> {
  const maxPreviewChars =
    typeof input.maxPreviewChars === "number" && Number.isFinite(input.maxPreviewChars) && input.maxPreviewChars > 0
      ? Math.trunc(input.maxPreviewChars)
      : DEFAULT_BASH_OUTPUT_PREVIEW_CHARS;
  const absoluteOutputPath =
    input.stateRootDir && input.sessionId
      ? await createAbsoluteOutputPath(input.stateRootDir, input.sessionId)
      : undefined;
  const outputPath =
    absoluteOutputPath && input.stateRootDir
      ? path.relative(input.stateRootDir, absoluteOutputPath) || undefined
      : undefined;

  let bufferedOutput = "";
  let previewHead = "";
  let previewTail = "";
  let totalChars = 0;
  let totalBytes = 0;
  let truncated = false;
  let pendingWrite = Promise.resolve();

  function append(chunk: string): void {
    if (!chunk) {
      return;
    }

    totalChars += chunk.length;
    totalBytes += Buffer.byteLength(chunk, "utf8");

    if (!truncated) {
      const combined = bufferedOutput + chunk;
      if (combined.length <= maxPreviewChars) {
        bufferedOutput = combined;
        return;
      }

      truncated = true;
      const headLimit = Math.ceil(maxPreviewChars / 2);
      const tailLimit = Math.max(1, maxPreviewChars - headLimit);
      previewHead = combined.slice(0, headLimit);
      previewTail = combined.slice(-tailLimit);
      queueWrite(combined);
      bufferedOutput = "";
      return;
    }

    const tailLimit = Math.max(1, maxPreviewChars - Math.ceil(maxPreviewChars / 2));
    previewTail = (previewTail + chunk).slice(-tailLimit);
    queueWrite(chunk);
  }

  async function finalize(): Promise<BashOutputCapture> {
    await pendingWrite;
    const omittedChars = Math.max(0, totalChars - previewHead.length - previewTail.length);
    return {
      outputPreview: truncated
        ? `${previewHead}\n\n... [truncated ${omittedChars} chars; head and tail preserved] ...\n\n${previewTail}`
        : bufferedOutput,
      outputPath: truncated ? outputPath : undefined,
      truncated,
      outputChars: totalChars,
      outputBytes: totalBytes,
    };
  }

  function queueWrite(chunk: string): void {
    if (!absoluteOutputPath) {
      return;
    }

    pendingWrite = pendingWrite.then(() => fs.appendFile(absoluteOutputPath, chunk, "utf8"));
  }

  return {
    append,
    finalize,
  };
}

async function createAbsoluteOutputPath(stateRootDir: string, sessionId: string): Promise<string> {
  const paths = getProjectStatePaths(stateRootDir);
  const sessionDir = path.join(paths.observabilityDir, "command-output", sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  return path.join(sessionDir, `${Date.now()}-bash-output-${crypto.randomUUID().slice(0, 8)}.txt`);
}
