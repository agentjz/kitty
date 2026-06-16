import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProviderUsage } from "../../src/provider/usageNormalizer.js";

test("normalizeProviderUsage reads OpenAI cached tokens", () => {
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

test("normalizeProviderUsage reads Anthropic cache creation and read tokens", () => {
  const usage = normalizeProviderUsage({
    input_tokens: 50,
    output_tokens: 12,
    total_tokens: 62,
    cache_read_input_tokens: 900,
    cache_creation_input_tokens: 200,
  });

  assert.equal(usage?.cacheReadTokens, 900);
  assert.equal(usage?.cacheCreationTokens, 200);
  assert.equal(usage?.cacheHitRate, 0.7826);
});

test("normalizeProviderUsage reads Gemini cached content tokens", () => {
  const usage = normalizeProviderUsage({
    input_tokens: 80,
    output_tokens: 20,
    total_tokens: 100,
    cachedContentTokenCount: 60,
  });

  assert.equal(usage?.cacheReadTokens, 60);
});
