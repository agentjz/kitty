import assert from "node:assert/strict";
import test from "node:test";

import {
  findModelInfo,
  findProviderInfo,
  resolveModelProfile,
} from "../../src/provider/catalog.js";

test("provider and model facts are resolved separately", () => {
  const yls = findProviderInfo("yls");
  const model = findModelInfo("yls", "gpt-5.5");

  assert.equal(yls?.apiKind, "openai-sdk");
  assert.equal(yls?.transport, "relay");
  assert.equal(yls?.defaultBaseUrl, "https://code.ylsagi.com/codex");
  assert.equal(model?.wireApi, "responses");
  assert.equal(model?.capabilities.reasoningContentReplay, "never");
});

test("deepseek model owns reasoning replay capability", () => {
  const profile = resolveModelProfile({
    provider: "deepseek",
    model: "deepseek-v4-flash",
  });

  assert.equal(profile.provider.apiKind, "deepseek-openai-compatible");
  assert.equal(profile.provider.transport, "standard");
  assert.equal(profile.model.wireApi, "chat.completions");
  assert.equal(profile.model.capabilities.reasoningContentReplay, "tool-call-required");
  assert.equal(profile.model.request.reasoningEffortDefault, "max");
  assert.equal(profile.model.limit.context, 1_000_000);
  assert.equal(profile.model.limit.output, 384_000);
});

test("relay providers are explicit provider facts", () => {
  assert.equal(findProviderInfo("yls")?.transport, "relay");
  assert.equal(findProviderInfo("ttapi")?.transport, "relay");
  assert.equal(findProviderInfo("openai")?.transport, "standard");
  assert.equal(findProviderInfo("openai-compatible")?.transport, "standard");
  assert.equal(findProviderInfo("nvidia")?.defaultBaseUrl, "https://integrate.api.nvidia.com/v1");
  assert.equal(findProviderInfo("agnes")?.defaultBaseUrl, "https://apihub.agnes-ai.com/v1");
  assert.equal(findProviderInfo("groq")?.defaultBaseUrl, "https://api.groq.com/openai/v1");
  assert.equal(findProviderInfo("cerebras")?.defaultBaseUrl, "https://api.cerebras.ai/v1");
  assert.equal(findProviderInfo("gemini")?.defaultBaseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
});

test("named compatible provider profiles use explicit current model facts", () => {
  assert.equal(resolveModelProfile({
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-flash",
  }).model.request.chat?.reasoning, "nvidia-reasoning-effort");
  assert.equal(resolveModelProfile({
    provider: "agnes",
    model: "agnes-2.0-flash",
  }).model.request.chat?.reasoning, "agnes-thinking");
  assert.equal(resolveModelProfile({
    provider: "agnes",
    model: "agnes-2.0-flash",
  }).model.limit.output, 65_500);
  assert.equal(resolveModelProfile({
    provider: "groq",
    model: "openai/gpt-oss-120b",
  }).model.request.chat?.reasoning, "reasoning-effort");
  assert.equal(resolveModelProfile({
    provider: "cerebras",
    model: "gpt-oss-120b",
  }).model.request.maxOutputTokensParam, "max_completion_tokens");
  assert.equal(resolveModelProfile({
    provider: "gemini",
    model: "gemini-2.5-flash",
  }).model.limit.context, 1_000_000);
});

test("unknown provider model pair fails clearly", () => {
  assert.throws(
    () => resolveModelProfile({ provider: "yls", model: "deepseek-v4-flash" }),
    /Unknown model for provider yls: deepseek-v4-flash/,
  );
});
