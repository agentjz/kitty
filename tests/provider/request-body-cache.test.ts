import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderRequestBody } from "../../src/provider/chatRequestBody.js";

test("OpenAI chat request carries stable prompt_cache_key", () => {
  const body = buildProviderRequestBody({
    provider: "openai",
    model: "gpt-5.5",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    stream: true,
    forceReasoning: false,
    sessionId: "session-1",
  });

  assert.match(String(body.prompt_cache_key), /^kitty:[0-9a-f]{8}$/);
});

test("DeepSeek chat request does not carry cache_control", () => {
  const body = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    stream: true,
    forceReasoning: false,
    sessionId: "session-1",
  });

  assert.equal("cache_control" in body, false);
  assert.equal("prompt_cache_key" in body, false);
});
