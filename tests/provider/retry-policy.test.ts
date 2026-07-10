import assert from "node:assert/strict";
import test from "node:test";

import {
  API_MAX_ATTEMPTS,
  computeApiRetryDelayMs,
  isRetryableApiError,
  withApiRetries,
} from "../../src/provider/apiRetry.js";

test("provider retry policy recognizes transient provider failures", () => {
  assert.equal(isRetryableApiError({ status: 429 }), true);
  assert.equal(isRetryableApiError({ status: 503 }), true);
  assert.equal(isRetryableApiError({ code: "ECONNRESET" }), true);
  assert.equal(isRetryableApiError(new Error("connection refused")), true);
  assert.equal(isRetryableApiError({ status: 400 }), false);
  assert.equal(isRetryableApiError(new Error("invalid request")), false);
});

test("provider retry delay honors retry-after before bounded backoff", () => {
  assert.equal(computeApiRetryDelayMs({ headers: { "retry-after": "2" } }, 1), 2_000);
  assert.equal(computeApiRetryDelayMs({ headers: { get: (name: string) => name === "retry-after" ? "3" : null } }, 1), 3_000);
  assert.equal(computeApiRetryDelayMs(new Error("timeout"), 1), 1_137);
  assert.equal(computeApiRetryDelayMs(new Error("timeout"), 20), 30_000);
});

test("provider retry has one bounded logical request budget", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const retries: number[] = [];

  await assert.rejects(
    () => withApiRetries(
      async () => {
        attempts += 1;
        throw Object.assign(new Error("overloaded"), { status: 503 });
      },
      {
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
        onRetry: (state) => {
          retries.push(state.nextAttempt);
        },
      },
    ),
    /overloaded/,
  );

  assert.equal(attempts, API_MAX_ATTEMPTS);
  assert.deepEqual(retries, [2, 3, 4]);
  assert.equal(delays.length, API_MAX_ATTEMPTS - 1);
});

test("provider retry aborts before another request is sent", async () => {
  const controller = new AbortController();
  let attempts = 0;

  await assert.rejects(
    () => withApiRetries(
      async () => {
        attempts += 1;
        throw Object.assign(new Error("overloaded"), { status: 503 });
      },
      {
        abortSignal: controller.signal,
        sleep: async () => {
          controller.abort();
        },
      },
    ),
    /aborted/i,
  );

  assert.equal(attempts, 1);
});
