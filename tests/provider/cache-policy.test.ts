import assert from "node:assert/strict";
import test from "node:test";

import { resolveProviderCachePolicy } from "../../src/provider/cachePolicy.js";

test("OpenAI cache policy uses stable prompt cache key", () => {
  const policy = resolveProviderCachePolicy({
    provider: "openai",
    model: "gpt-5.5",
    sessionId: "session-1",
  });

  assert.equal(policy.provider, "openai");
  assert.equal(policy.automaticPrefixCache, true);
  assert.match(policy.promptCacheKey ?? "", /^kitty:[0-9a-f]{8}$/);
});

test("DeepSeek cache policy keeps automatic prefix cache without request-only keys", () => {
  const policy = resolveProviderCachePolicy({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    sessionId: "session-1",
  });

  assert.equal(policy.provider, "deepseek");
  assert.equal(policy.automaticPrefixCache, true);
  assert.equal(policy.promptCacheKey, undefined);
});

test("unknown providers do not receive request cache controls", () => {
  const policy = resolveProviderCachePolicy({
    provider: "anthropic",
    model: "claude-sonnet-4",
    sessionId: "session-1",
  });

  assert.equal(policy.provider, "generic");
  assert.equal(policy.automaticPrefixCache, false);
  assert.equal(policy.promptCacheKey, undefined);
});
