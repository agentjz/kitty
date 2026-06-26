import type { ResolvedModelProfile } from "./catalog.js";

export type ProviderProbeKind = "models" | "responses" | "chat.completions";

export interface ProviderProbeRequest {
  endpoint: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export function resolveProviderProbeKind(profile: ResolvedModelProfile): ProviderProbeKind {
  if (profile.provider.transport === "relay") {
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
  if (probe === "responses") {
    return buildEndpoint(baseUrl, "responses");
  }

  if (probe === "chat.completions") {
    return buildEndpoint(baseUrl, "chat/completions");
  }

  return buildEndpoint(baseUrl, "models");
}

function buildProviderProbeBody(probe: ProviderProbeKind, model: string): string | undefined {
  if (probe === "models") {
    return undefined;
  }

  if (probe === "responses") {
    return JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: "Return ok.",
        },
      ],
      max_output_tokens: 8,
    });
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
      `User-fixable error: \`KITTY_BASE_URL\` is not a valid URL: ${baseUrl}. Fix it and rerun \`kitty doctor\`.`,
    );
  }
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
