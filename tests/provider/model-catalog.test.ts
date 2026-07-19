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

test("generic OpenAI-compatible endpoints accept an explicitly configured model", () => {
  const profile = resolveModelProfile({
    provider: "openai-compatible",
    model: "community/free-model",
  });

  assert.equal(profile.model.id, "community/free-model");
  assert.equal(profile.model.wireApi, "chat.completions");
  assert.equal(profile.model.request.chat?.toolChoice, "auto");
});
