import assert from "node:assert/strict";
import test from "node:test";

import { resolveModelProfile } from "../../src/provider/catalog.js";

test("DeepSeek model owns reasoning replay and cache facts", () => {
  const profile = resolveModelProfile({
    provider: "deepseek",
    model: "deepseek-v4-flash",
  });

  assert.equal(profile.provider.apiKind, "deepseek-openai-compatible");
  assert.equal(profile.model.wireApi, "chat.completions");
  assert.equal(profile.model.capabilities.reasoningContentReplay, "tool-call-required");
  assert.equal(profile.model.capabilities.cache, "provider-automatic");
  assert.equal(profile.model.request.reasoningEffortDefault, "max");
  assert.equal(profile.model.limit.context, 1_000_000);
  assert.equal(profile.model.limit.output, 384_000);
});

test("Agnes model owns its chat-template thinking contract", () => {
  const profile = resolveModelProfile({
    provider: "agnes",
    model: "agnes-2.0-flash",
  });

  assert.equal(profile.provider.defaultBaseUrl, "https://apihub.agnes-ai.com/v1");
  assert.equal(profile.model.request.chat?.reasoning, "agnes-thinking");
  assert.equal(profile.model.limit.context, 512_000);
  assert.equal(profile.model.limit.output, 65_500);
});

test("Agnes 2.5 Flash shares the current Agnes language-model contract", () => {
  const profile = resolveModelProfile({
    provider: "agnes",
    model: "agnes-2.5-flash",
  });

  assert.equal(profile.model.request.chat?.reasoning, "agnes-thinking");
  assert.equal(profile.model.limit.context, 512_000);
  assert.equal(profile.model.limit.output, 65_500);
});

test("Google Gemini owns its official Chat Completions and tool replay contract", () => {
  const profile = resolveModelProfile({
    provider: "google",
    model: "gemini-3.5-flash",
  });

  assert.equal(profile.provider.defaultBaseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(profile.provider.apiKind, "openai-compatible");
  assert.equal(profile.model.request.chat?.reasoning, "gemini-thinking");
  assert.equal(profile.model.request.chat?.toolSchema, "gemini");
  assert.equal(profile.model.request.reasoningEffortDefault, "medium");
  assert.equal(profile.model.capabilities.toolCallProviderMetadataReplay, "google-thought-signature-required");
  assert.equal(profile.model.capabilities.cache, "provider-automatic");
  assert.equal(profile.model.limit.context, 1_048_576);
  assert.equal(profile.model.limit.output, 65_536);
});

test("Zhipu GLM-4.7 Flash owns its preserved-thinking and free-model limits", () => {
  const profile = resolveModelProfile({
    provider: "zhipu",
    model: "glm-4.7-flash",
  });

  assert.equal(profile.provider.defaultBaseUrl, "https://open.bigmodel.cn/api/paas/v4");
  assert.equal(profile.model.request.chat?.reasoning, "zhipu-thinking");
  assert.equal(profile.model.capabilities.reasoningContentReplay, "tool-call-required");
  assert.equal(profile.model.capabilities.cache, "provider-automatic");
  assert.equal(profile.model.limit.context, 200_000);
  assert.equal(profile.model.limit.output, 131_072);
});

test("current Zhipu language models resolve with their published context limits", () => {
  for (const model of ["glm-4.6", "glm-4.7", "glm-5", "glm-5-turbo", "glm-5.1"]) {
    const profile = resolveModelProfile({ provider: "zhipu", model });
    assert.equal(profile.model.limit.context, 200_000, model);
    assert.equal(profile.model.limit.output, 131_072, model);
  }

  const glm52 = resolveModelProfile({ provider: "zhipu", model: "glm-5.2" });
  assert.equal(glm52.model.limit.context, 1_000_000);
  assert.equal(glm52.model.limit.output, 131_072);
  assert.equal(glm52.model.request.reasoningEffortDefault, "max");
});

test("generic OpenAI-compatible endpoints accept an explicitly configured model", () => {
  const profile = resolveModelProfile({
    provider: "openai-compatible",
    model: "community/free-model",
  });

  assert.equal(profile.model.id, "community/free-model");
  assert.equal(profile.model.wireApi, "chat.completions");
  assert.equal(profile.model.request.chat?.toolChoice, "auto");
});

test("LLM2API owns a generic relay endpoint and does not add upstream model presets", () => {
  const explicit = resolveModelProfile({
    provider: "llm2api",
    model: "model-from-llm2api-models",
  });
  assert.equal(explicit.provider.defaultBaseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(explicit.provider.apiKind, "openai-compatible");
  assert.equal(explicit.model.providerId, "llm2api");
  assert.equal(explicit.model.id, "model-from-llm2api-models");
  assert.equal(explicit.model.request.chat?.reasoning, "standard-thinking");
  assert.equal(explicit.model.capabilities.streamingTools, false);
  assert.equal(explicit.model.limit.context, 128_000);
});
