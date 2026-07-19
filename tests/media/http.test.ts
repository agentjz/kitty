import assert from "node:assert/strict";
import test from "node:test";

import { downloadMedia, MediaProviderError, requestMediaJson } from "../../src/media/http.js";

test("media POST is never retried across an uncertain response boundary", async () => {
  let calls = 0;
  await assert.rejects(() => requestMediaJson({
    endpoint: "https://example.test/images",
    method: "POST",
    headers: {},
    body: "{}",
  }, {
    timeoutMs: 1_000,
    retryGet: true,
    fetchImpl: async () => { calls += 1; return new Response("busy", { status: 503 }); },
    sleep: async () => undefined,
  }), (error: unknown) => error instanceof MediaProviderError && error.status === 503);
  assert.equal(calls, 1);
});

test("media POST retries only opted-in provider responses, never network failures", async () => {
  let responseCalls = 0;
  const result = await requestMediaJson({
    endpoint: "https://example.test/images",
    method: "POST",
    headers: {},
    body: "{}",
  }, {
    timeoutMs: 1_000,
    retryResponseStatuses: [429, 503],
    maxAttempts: 4,
    fetchImpl: async () => {
      responseCalls += 1;
      return responseCalls === 1
        ? new Response(JSON.stringify({ error: { message: "Service busy (id: req_retry_test)" } }), {
          status: 503,
          headers: { "retry-after": "0" },
        })
        : Response.json({ status: "completed" });
    },
    sleep: async () => undefined,
  });
  assert.deepEqual(result, { status: "completed" });
  assert.equal(responseCalls, 2);

  let networkCalls = 0;
  await assert.rejects(() => requestMediaJson({
    endpoint: "https://example.test/images",
    method: "POST",
    headers: {},
    body: "{}",
  }, {
    timeoutMs: 1_000,
    retryResponseStatuses: [429, 503],
    maxAttempts: 4,
    fetchImpl: async () => { networkCalls += 1; throw new TypeError("fetch failed"); },
    sleep: async () => undefined,
  }), (error: unknown) => error instanceof MediaProviderError && error.kind === "environment");
  assert.equal(networkCalls, 1);
});

test("media POST aborts during retry backoff without sending another request", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(() => requestMediaJson({
    endpoint: "https://example.test/images",
    method: "POST",
    headers: {},
    body: "{}",
  }, {
    timeoutMs: 1_000,
    signal: controller.signal,
    retryResponseStatuses: [503],
    maxAttempts: 4,
    fetchImpl: async () => {
      calls += 1;
      return new Response("busy", { status: 503 });
    },
    sleep: async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    },
  }), (error: unknown) => error instanceof MediaProviderError && error.kind === "aborted");
  assert.equal(calls, 1);
});

test("media 503 errors expose a concise request id instead of nested provider JSON", async () => {
  await assert.rejects(() => requestMediaJson({
    endpoint: "https://example.test/images",
    method: "POST",
    headers: {},
    body: "{}",
  }, {
    timeoutMs: 1_000,
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: "ServiceUnavailableError: Service busy (id: req_900280a667e947d5)", type: "upstream_error" },
    }), { status: 503 }),
  }), (error: unknown) => error instanceof MediaProviderError &&
    error.message === "Media provider is temporarily unavailable (HTTP 503, request req_900280a667e947d5)." &&
    !error.message.includes("upstream_error"));
});

test("media GET retries temporary errors and honors Retry-After", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await requestMediaJson({
    endpoint: "https://example.test/video",
    method: "GET",
    headers: {},
  }, {
    timeoutMs: 1_000,
    retryGet: true,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: 429, headers: { "retry-after": "2" } })
        : Response.json({ status: "completed" });
    },
    sleep: async (ms) => { delays.push(ms); },
  });
  assert.deepEqual(result, { status: "completed" });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2_000]);
});

test("media timeout is distinct from a caller abort", async () => {
  await assert.rejects(() => requestMediaJson({
    endpoint: "https://example.test/slow",
    method: "GET",
    headers: {},
  }, {
    timeoutMs: 10,
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  }), (error: unknown) => error instanceof MediaProviderError && error.kind === "timeout");

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => requestMediaJson({
    endpoint: "https://example.test/abort",
    method: "GET",
    headers: {},
  }, {
    timeoutMs: 1_000,
    signal: controller.signal,
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
    }),
  }), (error: unknown) => error instanceof MediaProviderError && error.kind === "aborted");
});

test("media JSON rejects malformed provider responses", async () => {
  await assert.rejects(() => requestMediaJson({ endpoint: "https://example.test/json", method: "GET", headers: {} }, {
    timeoutMs: 1_000,
    fetchImpl: async () => new Response("not-json", { status: 200 }),
  }), (error: unknown) => error instanceof MediaProviderError && error.kind === "contract");
});

test("media download enforces limits before and during streaming", async () => {
  await assert.rejects(() => downloadMedia({ endpoint: "https://example.test/large", method: "GET", headers: {} }, {
    timeoutMs: 1_000,
    maxBytes: 3,
    fetchImpl: async () => new Response("1234", { headers: { "content-length": "4" } }),
  }), (error: unknown) => error instanceof MediaProviderError && error.kind === "contract");

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3, 4]));
      controller.close();
    },
  });
  await assert.rejects(() => downloadMedia({ endpoint: "https://example.test/stream", method: "GET", headers: {} }, {
    timeoutMs: 1_000,
    maxBytes: 3,
    fetchImpl: async () => new Response(body),
  }), (error: unknown) => error instanceof MediaProviderError && error.kind === "contract");
});

test("media download retries transient GET failures but not contract failures", async () => {
  let calls = 0;
  const result = await downloadMedia({ endpoint: "https://example.test/file", method: "GET", headers: {} }, {
    timeoutMs: 1_000,
    maxBytes: 10,
    retryGet: true,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? new Response("busy", { status: 503 }) : new Response("ok");
    },
  });
  assert.equal(result.bytes.toString(), "ok");
  assert.equal(calls, 2);
});

test("media download reports an interrupted body without publishing partial bytes", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.error(new Error("connection reset"));
    },
  });
  await assert.rejects(() => downloadMedia({ endpoint: "https://example.test/interrupted", method: "GET", headers: {} }, {
    timeoutMs: 1_000,
    maxBytes: 10,
    fetchImpl: async () => new Response(body),
  }), (error: unknown) => error instanceof MediaProviderError && error.kind === "environment");
});
