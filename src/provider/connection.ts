import { resolveModelProfile } from "./catalog.js";
import { buildProviderProbeRequest, resolveProviderProbeKind, type ProviderProbeKind } from "./transport.js";

export interface ProviderConnectionProbeInput {
  provider?: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export type ProviderConnectionProbeResult =
  | {
      kind: "ok";
      probe: ProviderProbeKind;
      models?: number;
      resolvedBaseUrl: string;
      probeTimeoutMs: number;
    }
  | {
      kind: "user" | "environment" | "provider";
      message: string;
      probeTimeoutMs: number;
    };

export async function probeProviderConnection(
  input: ProviderConnectionProbeInput,
): Promise<ProviderConnectionProbeResult> {
  const profile = resolveModelProfile({
    provider: input.provider,
    model: input.model,
  });
  const probe = resolveProviderProbeKind(profile);
  const fetchImpl = input.fetchImpl ?? fetch;
  const probeTimeoutMs = profile.provider.doctorProbeTimeoutMs;
  let lastFailure:
    | Exclude<ProviderConnectionProbeResult, { kind: "ok" }>
    | undefined;

  for (const candidateBaseUrl of buildProviderBaseUrlCandidates(input.baseUrl)) {
    const request = buildProviderProbeRequest({
      baseUrl: candidateBaseUrl,
      apiKey: input.apiKey,
      model: profile.model.id,
      probe,
      authentication: profile.provider.authentication,
    });
    let response: Response;

    try {
      response = await fetchImpl(request.endpoint, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(probeTimeoutMs),
      });
    } catch (error) {
      lastFailure = {
        kind: "environment",
        message: buildNetworkErrorMessage(input.baseUrl, error),
        probeTimeoutMs,
      };
      continue;
    }

    if (response.status === 404) {
      lastFailure = {
        kind: "user",
        message: `User-fixable error: provider endpoint returned 404 at ${request.endpoint}. Check \`KITTY_PROVIDER\`, \`KITTY_MODEL\`, and \`KITTY_BASE_URL\` together; this provider uses ${profile.model.wireApi}.`,
        probeTimeoutMs,
      };
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      return {
        kind: "user",
        message: "User-fixable error: provider authentication failed. Check `KITTY_API_KEY`, or confirm this key is authorized for the base URL.",
        probeTimeoutMs,
      };
    }

    if (response.status >= 500) {
      return {
        kind: "provider",
        message: `Provider error: service returned ${response.status}. Retry later or confirm the provider service is healthy.`,
        probeTimeoutMs,
      };
    }

    if (!response.ok) {
      return {
        kind: "provider",
        message: `Provider error: service returned ${response.status}. This is not a local runtime initialization issue; check provider response or configuration.`,
        probeTimeoutMs,
      };
    }

    if (probe === "responses") {
      return {
        kind: "ok",
        probe: "responses",
        resolvedBaseUrl: candidateBaseUrl,
        probeTimeoutMs,
      };
    }

    if (probe === "chat.completions") {
      return {
        kind: "ok",
        probe: "chat.completions",
        resolvedBaseUrl: candidateBaseUrl,
        probeTimeoutMs,
      };
    }

    const payload = await response.json().catch(() => null) as { data?: unknown } | null;
    const models = Array.isArray(payload?.data) ? payload.data.length : 0;
    return {
      kind: "ok",
      probe: "models",
      models,
      resolvedBaseUrl: candidateBaseUrl,
      probeTimeoutMs,
    };
  }

  return lastFailure ?? {
    kind: "environment",
    message: buildNetworkErrorMessage(input.baseUrl, new Error("Provider probe failed.")),
    probeTimeoutMs,
  };
}

export function buildProviderBaseUrlCandidates(baseUrl: string): string[] {
  const normalized = trimTrailingSlash(baseUrl);
  if (!normalized) {
    return [normalized];
  }

  const candidates = [normalized];

  try {
    const parsed = new URL(normalized);
    if (parsed.pathname === "" || parsed.pathname === "/") {
      candidates.push(trimTrailingSlash(new URL("v1", ensureTrailingSlash(parsed.toString())).toString()));
    }
  } catch {
    return candidates;
  }

  return [...new Set(candidates)];
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function trimTrailingSlash(baseUrl: string): string {
  const trimmed = String(baseUrl ?? "").trim();
  if (!trimmed) {
    return trimmed;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function buildNetworkErrorMessage(baseUrl: string, error: unknown): string {
  const code = String((error as { code?: unknown }).code ?? "");
  const detail = error instanceof Error ? error.message : String(error);
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "ECONNRESET"].includes(code)) {
    return `Environment error: unable to connect to ${baseUrl}. Check network, proxy settings, or whether \`KITTY_BASE_URL\` is reachable.`;
  }

  if (/fetch failed|network|timeout|socket hang up|econnrefused|enotfound|etimedout/i.test(detail)) {
    return `Environment error: connection to ${baseUrl} failed. Check network, proxy settings, or whether the provider endpoint is reachable.`;
  }

  return `Environment error: connection to ${baseUrl} failed. Cause: ${detail}`;
}
