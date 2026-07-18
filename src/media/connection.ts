import type { MediaRuntimeConfig } from "../types.js";
import { requestMediaJson } from "./http.js";
import { resolveMediaProvider } from "./catalog.js";

export async function probeMediaConnection(
  config: MediaRuntimeConfig,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ kind: "ok"; provider: string; models: number; baseUrl: string }> {
  const provider = resolveMediaProvider(config.provider);
  const payload = await requestMediaJson({
    endpoint: `${config.baseUrl.replace(/\/+$/u, "")}/models`,
    method: "GET",
    headers: { Authorization: `Bearer ${config.apiKey}` },
  }, {
    timeoutMs: Math.min(config.requestTimeoutMs, 30_000),
    retryGet: true,
    fetchImpl: options.fetchImpl,
  });
  const models = payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
    ? (payload as { data: unknown[] }).data.length
    : 0;
  return { kind: "ok", provider: provider.id, models, baseUrl: config.baseUrl };
}
