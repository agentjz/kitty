import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProviderUsage } from "../../src/provider/usageNormalizer.js";

test("normalizeProviderUsage reads OpenAI-compatible cached tokens", () => {
  const usage = normalizeProviderUsage({
    prompt_tokens: 1200,
    completion_tokens: 40,
    total_tokens: 1240,
    prompt_tokens_details: {
      cached_tokens: 960,
    },
  });

  assert.equal(usage?.inputTokens, 1200);
  assert.equal(usage?.outputTokens, 40);
  assert.equal(usage?.totalTokens, 1240);
  assert.equal(usage?.cacheReadTokens, 960);
  assert.equal(usage?.cacheHitRate, 0.4444);
});

test("normalizeProviderUsage reads DeepSeek cache hit and miss tokens", () => {
  const usage = normalizeProviderUsage({
    prompt_tokens: 1000,
    completion_tokens: 50,
    total_tokens: 1050,
    prompt_cache_hit_tokens: 800,
    prompt_cache_miss_tokens: 200,
  });

  assert.equal(usage?.cacheHitTokens, 800);
  assert.equal(usage?.cacheMissTokens, 200);
  assert.equal(usage?.cacheHitRate, 0.8);
});
