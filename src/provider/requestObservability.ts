import { recordObservabilityEvent } from "../observability/writer.js";
import type { ModelRequestMetric } from "./metrics.js";
import { hasProviderUsageSnapshot } from "./usageNormalizer.js";

export interface ProviderRequestObservability {
  rootDir: string;
  sessionId: string;
  identityKind?: string;
  identityName?: string;
  configuredModel: string;
}

export async function recordProviderRequestEvent(input: {
  observability?: ProviderRequestObservability;
  request: {
    provider: string;
    model: string;
  };
  wireApi: "responses" | "chat.completions";
  status: "started" | "completed" | "failed";
  startedAt?: number;
  baseUrl?: string;
  usage?: ModelRequestMetric["usage"];
  error?: unknown;
}): Promise<void> {
  const observability = input.observability;
  if (!observability) {
    return;
  }

  await recordObservabilityEvent(observability.rootDir, {
    event: "model.request",
    status: input.status,
    sessionId: observability.sessionId,
    identityKind: observability.identityKind,
    identityName: observability.identityName,
    model: input.request.model,
    durationMs: input.startedAt === undefined ? undefined : Date.now() - input.startedAt,
    error: input.error,
    details: {
      provider: input.request.provider,
      configuredModel: observability.configuredModel,
      requestModel: input.request.model,
      wireApi: input.wireApi,
      baseUrl: input.baseUrl,
      usage: input.usage,
      usageAvailable: hasProviderUsageSnapshot(input.usage),
    },
  });
}
