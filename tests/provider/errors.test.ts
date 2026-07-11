import assert from "node:assert/strict";
import test from "node:test";

import {
  canRetryWithAlternateBaseUrl,
  classifyProviderError,
  isRetryableProviderError,
  isStreamingFallbackEligible,
  normalizeProviderError,
} from "../../src/provider/errors.js";

test("provider error classification drives retry, fallback, and alternate endpoint boundaries", () => {
  assert.equal(classifyProviderError({ status: 401 }).kind, "auth");
  assert.equal(classifyProviderError({ status: 400 }).kind, "contract");
  assert.equal(classifyProviderError({ status: 429 }).kind, "rate_limit");
  assert.equal(classifyProviderError({ status: 503 }).kind, "server");
  assert.equal(classifyProviderError({ status: 404 }).kind, "not_found");
  assert.equal(classifyProviderError({ code: "ECONNRESET" }).kind, "temporary");
  assert.equal(classifyProviderError(new Error("stream ended unexpectedly")).kind, "stream_framing");

  assert.equal(isRetryableProviderError({ status: 429 }), true);
  assert.equal(isRetryableProviderError({ status: 400 }), false);
  assert.equal(isStreamingFallbackEligible(new Error("stream ended unexpectedly")), true);
  assert.equal(isStreamingFallbackEligible({ status: 503 }), false);
  assert.equal(canRetryWithAlternateBaseUrl({ status: 404 }), true);
  assert.equal(canRetryWithAlternateBaseUrl({ status: 401 }), false);
});

test("provider request boundaries normalize transport errors once", () => {
  const source = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
  const error = normalizeProviderError(source);

  assert.equal(error.name, "ProviderError");
  assert.equal(error.facts.kind, "temporary");
  assert.equal(error.cause, source);
  assert.equal(normalizeProviderError(error), error);
});
