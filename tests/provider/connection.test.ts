import assert from "node:assert/strict";
import test from "node:test";

import { getErrorMessage } from "../../src/agent/errors.js";
import {
  buildProviderBaseUrlCandidates,
  probeProviderConnection,
} from "../../src/provider/connection.js";
import {
  buildProviderProbeRequest,
  resolveProviderProbeKind,
} from "../../src/provider/transport.js";
import { resolveModelProfile } from "../../src/provider/catalog.js";

test("relay providers probe the model wire API instead of assuming /models", async () => {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const result = await probeProviderConnection({
    provider: "yls",
    model: "gpt-5.5",
    baseUrl: "https://code.ylsagi.com/codex",
    apiKey: "test-key",
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        method: String(init?.method),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return new Response(JSON.stringify({ id: "response-id" }), { status: 200 });
    },
  });

  assert.deepEqual(result, {
    kind: "ok",
    probe: "responses",
    resolvedBaseUrl: "https://code.ylsagi.com/codex",
    probeTimeoutMs: 45_000,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://code.ylsagi.com/codex/responses");
  assert.equal(requests[0]?.method, "POST");
  assert.match(requests[0]?.body ?? "", /"model":"gpt-5\.5"/);
});

test("standard providers keep the normal models probe", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const result = await probeProviderConnection({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    baseUrl: "https://api.deepseek.com",
    apiKey: "test-key",
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        method: String(init?.method),
      });
      return new Response(JSON.stringify({ data: [{ id: "deepseek-v4-flash" }] }), { status: 200 });
    },
  });

  assert.deepEqual(result, {
    kind: "ok",
    probe: "models",
    models: 1,
    resolvedBaseUrl: "https://api.deepseek.com",
    probeTimeoutMs: 10_000,
  });
  assert.equal(requests[0]?.url, "https://api.deepseek.com/models");
  assert.equal(requests[0]?.method, "GET");
});

test("relay transport derives probe kind from provider transport and model wire API", () => {
  assert.equal(
    resolveProviderProbeKind(resolveModelProfile({ provider: "yls", model: "gpt-5.5" })),
    "responses",
  );
  assert.equal(
    resolveProviderProbeKind(resolveModelProfile({ provider: "ttapi", model: "gpt-5.4" })),
    "responses",
  );
  assert.equal(
    resolveProviderProbeKind(resolveModelProfile({ provider: "deepseek", model: "deepseek-v4-flash" })),
    "models",
  );
});

test("named OpenAI-compatible providers probe the chat endpoint", () => {
  assert.equal(
    resolveProviderProbeKind(resolveModelProfile({ provider: "nvidia", model: "deepseek-ai/deepseek-v4-flash" })),
    "chat.completions",
  );
  assert.equal(
    resolveProviderProbeKind(resolveModelProfile({ provider: "groq", model: "openai/gpt-oss-120b" })),
    "chat.completions",
  );
});

test("relay chat completions probe uses the chat endpoint shape", () => {
  const request = buildProviderProbeRequest({
    baseUrl: "https://relay.example/api",
    apiKey: "test-key",
    model: "relay-chat",
    probe: "chat.completions",
  });

  assert.equal(request.endpoint, "https://relay.example/api/chat/completions");
  assert.equal(request.method, "POST");
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.match(request.body ?? "", /"messages":/);
  assert.match(request.body ?? "", /"max_tokens":8/);
});

test("root base URL candidates still add /v1 for standard OpenAI-compatible endpoints", () => {
  assert.deepEqual(
    buildProviderBaseUrlCandidates("https://api.example.com"),
    ["https://api.example.com", "https://api.example.com/v1"],
  );
  assert.deepEqual(
    buildProviderBaseUrlCandidates("https://code.ylsagi.com/codex"),
    ["https://code.ylsagi.com/codex"],
  );
});

test("provider 404 message does not blame only KITTY_BASE_URL", () => {
  const message = getErrorMessage({ status: 404, message: "Not Found" });

  assert.match(message, /KITTY_PROVIDER/);
  assert.match(message, /KITTY_MODEL/);
  assert.match(message, /KITTY_BASE_URL/);
  assert.doesNotMatch(message, /correct OpenAI-compatible API base URL/);
});
