import type { ResolvedModelProfile } from "./catalog.js";

export type ProviderProbeKind = "models" | "chat.completions";

export interface ProviderProbeRequest {
  endpoint: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export function resolveProviderProbeKind(profile: ResolvedModelProfile): ProviderProbeKind {
  if (
    profile.provider.apiKind === "openai-compatible" &&
    profile.provider.id !== "openai-compatible"
  ) {
    return profile.model.wireApi;
  }

  return "models";
}

export function buildProviderProbeRequest(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  probe: ProviderProbeKind;
}): ProviderProbeRequest {
  return {
    endpoint: buildProviderProbeEndpoint(input.baseUrl, input.probe),
    method: input.probe === "models" ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      ...(input.probe === "models" ? {} : { "Content-Type": "application/json" }),
    },
    body: buildProviderProbeBody(input.probe, input.model),
  };
}

export function buildProviderProbeEndpoint(baseUrl: string, probe: ProviderProbeKind): string {
  if (probe === "chat.completions") {
    return buildEndpoint(baseUrl, "chat/completions");
  }

  return buildEndpoint(baseUrl, "models");
}

function buildProviderProbeBody(probe: ProviderProbeKind, model: string): string | undefined {
  if (probe === "models") {
    return undefined;
  }

  return JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: "Return ok.",
      },
    ],
    max_tokens: 8,
    stream: false,
  });
}

function buildEndpoint(baseUrl: string, path: string): string {
  try {
    return new URL(path, ensureTrailingSlash(baseUrl)).toString();
  } catch {
    throw new Error(
      `User-fixable error: \`KITTY_BASE_URL\` is not a valid URL: ${baseUrl}. Fix it in \`.kitty/.env\` and start Kitty again.`,
    );
  }
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
