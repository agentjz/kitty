import { resolveProviderCapabilities } from "./capabilities.js";

export interface ProviderCachePolicyInput {
  provider?: string;
  model: string;
  sessionId?: string;
  projectRoot?: string;
}

export interface ProviderCachePolicy {
  provider: "openai" | "deepseek" | "generic";
  automaticPrefixCache: boolean;
  promptCacheKey?: string;
}

export function resolveProviderCachePolicy(input: ProviderCachePolicyInput): ProviderCachePolicy {
  const capabilities = resolveProviderCapabilities(input);

  if (capabilities.provider === "openai") {
    return {
      provider: "openai",
      automaticPrefixCache: true,
      promptCacheKey: buildPromptCacheKey(input),
    };
  }

  if (capabilities.provider === "deepseek") {
    return {
      provider: "deepseek",
      automaticPrefixCache: true,
    };
  }

  return {
    provider: "generic",
    automaticPrefixCache: false,
  };
}

function buildPromptCacheKey(input: ProviderCachePolicyInput): string | undefined {
  const seed = input.sessionId || input.projectRoot;
  if (!seed) {
    return undefined;
  }

  return `kitty:${stableHash(seed)}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
