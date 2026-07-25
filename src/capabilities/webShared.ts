import { ControlPlaneLedger } from "../control/ledger.js";
import { WEB_CAPABILITY } from "./definitions.js";

export interface WebDependencies {
  fetch?: typeof fetch;
}

export const WEB_REQUEST_TIMEOUT_MS = 30_000;
export const WEB_SEARCH_RESULT_LIMIT = 8;
export const WEB_EVIDENCE_MAX_BYTES = 256_000;
export const WEB_SEARCH_RESPONSE_MAX_BYTES = 1_000_000;
export const WEB_FETCH_RESPONSE_MAX_BYTES = 1_000_000;
export const WEB_FETCH_MODEL_MAX_CHARS = 32_000;
export const WEB_DOWNLOAD_MAX_BYTES = 50 * 1024 * 1024;

export class KnownWebResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnownWebResponseError";
  }
}

export function readHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid HTTP(S) URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol ${url.protocol}; only HTTP(S) is allowed.`);
  }
  return url;
}

export function createWebRequestController(
  sourceSignal: AbortSignal | undefined,
  timeoutMessage: string,
): { signal: AbortSignal; close(): void } {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(timeoutMessage)),
    WEB_REQUEST_TIMEOUT_MS,
  );
  timeout.unref();
  const forwardAbort = () => controller.abort(sourceSignal?.reason);
  sourceSignal?.addEventListener("abort", forwardAbort, { once: true });
  if (sourceSignal?.aborted) forwardAbort();
  return {
    signal: controller.signal,
    close() {
      clearTimeout(timeout);
      sourceSignal?.removeEventListener("abort", forwardAbort);
    },
  };
}

export async function readBoundedResponse(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new KnownWebResponseError(`Response declares ${declaredLength} bytes, above the ${maxBytes} byte limit.`);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new KnownWebResponseError(`Response exceeded the ${maxBytes} byte limit.`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export function decodeResponseText(bytes: Buffer, contentType: string): string {
  const charset = /charset\s*=\s*["']?([^;\s"']+)/iu.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export function updateWebHealth(rootDir: string, status: "ready" | "degraded", message?: string): void {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    ledger.capabilities.ensure(WEB_CAPABILITY);
    ledger.capabilities.updateHealth({ id: WEB_CAPABILITY.id, status, message });
  } finally {
    ledger.close();
  }
}
