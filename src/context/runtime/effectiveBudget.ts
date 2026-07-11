import { resolveModelProfile } from "../../provider/catalog.js";
import { normalizeProviderMaxOutputTokens } from "../../provider/maxOutputTokens.js";
import type { RuntimeConfig } from "../../types.js";

export function resolveEffectiveMaxContextChars(
  config: Pick<RuntimeConfig, "model" | "maxContextChars"> & {
    provider?: RuntimeConfig["provider"];
    maxOutputTokens?: RuntimeConfig["maxOutputTokens"];
  },
): number {
  const configuredMaxChars = Math.max(1, Math.trunc(config.maxContextChars));
  const profile = resolveModelProfile({
    provider: config.provider,
    model: config.model,
  });
  const reservedOutputTokens = normalizeProviderMaxOutputTokens(
    config.maxOutputTokens ?? profile.model.limit.output,
    profile.model.limit.output,
  );
  const modelInputLimit = Math.max(1, profile.model.limit.context - reservedOutputTokens);

  return Math.min(configuredMaxChars, modelInputLimit);
}
