export interface ProviderProbeRequest {
  endpoint: string;
  method: "GET";
  headers: Record<string, string>;
}

export function buildProviderProbeRequest(input: {
  baseUrl: string;
  apiKey: string;
}): ProviderProbeRequest {
  return {
    endpoint: buildProviderProbeEndpoint(input.baseUrl),
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
  };
}

export function buildProviderProbeEndpoint(baseUrl: string): string {
  return buildEndpoint(baseUrl, "models");
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
