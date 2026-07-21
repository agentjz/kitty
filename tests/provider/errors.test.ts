import assert from "node:assert/strict";
import test from "node:test";

import {
  canRetryWithAlternateBaseUrl,
  classifyProviderError,
  isRetryableProviderError,
  isStreamingFallbackEligible,
  formatProviderError,
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

test("Zhipu error policy retries transient limits but stops on quota and access limits", () => {
  const transient = normalizeProviderError({
    status: 429,
    code: 1302,
    message: "concurrency limit",
  }, "zhipu");
  const terminal = normalizeProviderError({
    status: 429,
    error: { code: 1310 },
    message: "weekly limit reached",
  }, "zhipu");

  assert.equal(transient.facts.code, "1302");
  assert.equal(isRetryableProviderError(transient), true);
  assert.equal(terminal.facts.code, "1310");
  assert.equal(isRetryableProviderError(terminal), false);
  assert.match(formatProviderError(terminal) ?? "", /not retried automatically/u);
});

test("Google error policy follows structured retry and quota facts", () => {
  const minuteLimit = normalizeProviderError({
    status: 429,
    error: {
      code: 429,
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
        },
        {
          "@type": "type.googleapis.com/google.rpc.RetryInfo",
          retryDelay: "3.5s",
        },
      ],
    },
  }, "google");
  const dailyLimit = normalizeProviderError({
    status: 429,
    error: {
      code: 429,
      details: [{
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
      }],
    },
  }, "google");

  assert.equal(minuteLimit.facts.retryable, true);
  assert.equal(minuteLimit.facts.retryAfterMs, 3_500);
  assert.equal(isRetryableProviderError(minuteLimit), true);
  assert.equal(dailyLimit.facts.retryable, false);
  assert.equal(isRetryableProviderError(dailyLimit), false);
  assert.match(formatProviderError(dailyLimit) ?? "", /not retried automatically/u);
});

test("provider request boundaries normalize transport errors once", () => {
  const source = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
  const error = normalizeProviderError(source);

  assert.equal(error.name, "ProviderError");
  assert.equal(error.facts.kind, "temporary");
  assert.equal(error.cause, source);
  assert.equal(normalizeProviderError(error), error);
});
