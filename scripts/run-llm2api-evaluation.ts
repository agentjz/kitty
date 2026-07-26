import { resolveRuntimeConfig } from "../src/config/runtime.js";
import { runProductionRealTurnCheck } from "../src/evaluation/production.js";
import { runProductionRepairCheck } from "../src/evaluation/productionRepair.js";
import { probeProviderConnection } from "../src/provider/connection.js";
import { createProviderClientPool } from "../src/provider/client.js";
import { ProviderError } from "../src/provider/errors.js";
import { fetchLlm2apiModelCapabilities } from "../src/provider/llm2apiModels.js";
import { fetchAssistantResponse } from "../src/provider/request.js";
import { runProductionBackgroundCheck } from "../src/evaluation/productionBackground.js";
import { runProductionContextPressureCheck } from "../src/evaluation/productionContextPressure.js";
import { runProductionBrowserCheck } from "../src/evaluation/productionBrowser.js";

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const config = await resolveRuntimeConfig({ cwd: rootDir });
  if (config.provider !== "llm2api") {
    throw new Error(`LLM2API evaluation requires KITTY_PROVIDER=llm2api, received ${config.provider}.`);
  }
  if (!config.apiKey.startsWith("llmg_")) {
    throw new Error("LLM2API evaluation requires a generated downstream API key.");
  }

  const probe = await probeProviderConnection({
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  if (probe.kind !== "ok") {
    throw new Error(`LLM2API model probe failed: ${probe.message}`);
  }
  console.log(`passed llm2api-model-probe: model=${config.model}, wire=${probe.probe}`);
  const capabilities = await fetchLlm2apiModelCapabilities({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  });
  console.log(`passed llm2api-model-capabilities: tools=${capabilities.supportsTools}, streamingTools=${capabilities.supportsStreamingTools}, streamUsage=${capabilities.chat.streamUsage}`);

  try {
    await fetchAssistantResponse(
      createProviderClientPool(config),
      [{ role: "user", content: "Reply with exactly LLM2API_KITTY_SMOKE_OK." }],
      {
        provider: config.provider,
        model: config.model,
        thinking: config.thinking,
        reasoningEffort: config.reasoningEffort,
        maxOutputTokens: 64,
        capabilities,
      },
      undefined,
      undefined,
    );
    console.log("passed llm2api-stream-smoke: Kitty request contract accepted");
  } catch (error) {
    throw new Error(`LLM2API stream smoke failed: ${formatProviderFailure(error)}`);
  }

  const checks = [
    await runProductionRealTurnCheck("production-real-turn", rootDir),
    await runProductionContextPressureCheck("production-context-pressure", rootDir),
    await runProductionBackgroundCheck("production-background-turn", rootDir),
    await runProductionBrowserCheck("production-browser-turn", rootDir),
    await runProductionRepairCheck("production-tool-turn", rootDir),
  ];
  for (const check of checks) {
    console.log(`${check.status} ${check.id}: ${check.fact}${check.error ? ` (${check.error})` : ""}`);
    if (check.status !== "passed") {
      process.exitCode = 1;
      return;
    }
  }
  console.log("LLM2API relay evaluation: passed");
}

function formatProviderFailure(error: unknown): string {
  const providerError = error instanceof ProviderError ? error : undefined;
  const cause = providerError?.cause as {
    error?: Record<string, unknown>;
    status?: unknown;
  } | undefined;
  const detail = cause?.error ?? {};
  const fields = {
    kind: providerError?.facts.kind ?? "unknown",
    status: providerError?.facts.status ?? cause?.status ?? "unknown",
    code: providerError?.facts.code ?? readSafeField(detail, "code"),
    type: readSafeField(detail, "type"),
    param: readSafeField(detail, "param"),
    capability: readSafeField(detail, "capability"),
    provider: readSafeField(detail, "provider"),
    model: readSafeField(detail, "model"),
  };
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(", ");
}

function readSafeField(source: Record<string, unknown>, name: string): string | number | undefined {
  const value = source[name];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}
