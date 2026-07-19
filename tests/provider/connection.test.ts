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

test("DeepSeek probes the provider model endpoint", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const result = await probeProviderConnection({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    baseUrl: "https://api.deepseek.com",
    apiKey: "test-key",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), method: String(init?.method) });
      return Response.json({ data: [{ id: "deepseek-v4-flash" }] });
    },
  });

  assert.equal(result.kind, "ok");
  assert.equal(result.probe, "models");
  assert.equal(requests[0]?.url, "https://api.deepseek.com/models");
  assert.equal(requests[0]?.method, "GET");
});

test("Agnes probes its Chat Completions contract", () => {
  assert.equal(
    resolveProviderProbeKind(resolveModelProfile({ provider: "agnes", model: "agnes-2.0-flash" })),
    "chat.completions",
  );
  const request = buildProviderProbeRequest({
    baseUrl: "https://apihub.agnes-ai.com/v1",
    apiKey: "test-key",
    model: "agnes-2.0-flash",
    probe: "chat.completions",
  });
  assert.equal(request.endpoint, "https://apihub.agnes-ai.com/v1/chat/completions");
  assert.equal(request.method, "POST");
  assert.match(request.body ?? "", /"messages":/u);
});

test("base URL candidates add v1 only at a host root", () => {
  assert.deepEqual(
    buildProviderBaseUrlCandidates("https://api.example.com"),
    ["https://api.example.com", "https://api.example.com/v1"],
  );
  assert.deepEqual(
    buildProviderBaseUrlCandidates("https://api.example.com/openai"),
    ["https://api.example.com/openai"],
  );
});

test("provider 404 guidance names the coupled configuration facts", () => {
  const message = getErrorMessage({ status: 404, message: "Not Found" });
  assert.match(message, /KITTY_PROVIDER/u);
  assert.match(message, /KITTY_MODEL/u);
  assert.match(message, /KITTY_BASE_URL/u);
});
