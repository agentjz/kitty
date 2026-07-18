import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  findModelInfo,
  findProviderInfo,
  resolveModelProfile,
} from "../../src/provider/catalog.js";
import { buildProviderRequestBody } from "../../src/provider/chatRequestBody.js";
import { buildProviderProbeRequest, resolveProviderProbeKind } from "../../src/provider/transport.js";
import { PROVIDER_PRESETS } from "../../src/config/providerPresets.js";
import { createProviderClientPool } from "../../src/provider/client.js";

test("llama.cpp exposes the local provider without remote authentication", () => {
  const provider = findProviderInfo("llama.cpp");
  assert.equal(provider?.defaultBaseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(provider?.authentication, "none");
  assert.equal(resolveProviderProbeKind(resolveModelProfile({
    provider: "llama.cpp",
    model: "gemma-3-12b-it-q4_0.gguf",
  })), "chat.completions");

  const request = buildProviderProbeRequest({
    baseUrl: provider!.defaultBaseUrl,
    apiKey: "should-not-be-sent",
    model: "gemma-3-12b-it-q4_0.gguf",
    probe: "chat.completions",
    authentication: provider!.authentication,
  });
  assert.equal(request.headers.Authorization, undefined);
});

test("llama.cpp SDK requests remove the placeholder Authorization header", async (t) => {
  const originalFetch = globalThis.fetch;
  let authorization: string | null | undefined;
  globalThis.fetch = async (_url, init) => {
    authorization = new Headers(init?.headers).get("authorization");
    return Response.json({ object: "list", data: [] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const pool = createProviderClientPool({
    provider: "llama.cpp",
    model: "gemma-3-12b-it-q4_0.gguf",
    baseUrl: "http://127.0.0.1:8080/v1",
    apiKey: "must-not-be-sent",
  });
  await pool.candidates()[0]!.client.models.list();
  assert.equal(authorization, null);
});

test("llama.cpp exposes only the selected Gemma local model", () => {
  assert.equal(findModelInfo("llama.cpp", "gemma-3-12b-it-q4_0.gguf")?.providerId, "llama.cpp");
  assert.equal(PROVIDER_PRESETS.filter((preset) => preset.provider === "llama.cpp").length, 1);
});

test("llama.cpp deployment manifest matches catalog and preset model ids", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "llama", "models.json"), "utf8")) as Array<{
    file: string;
    bytes: number;
    sha256: string;
  }>;
  const expected = manifest.map((item) => item.file).sort();
  const catalog = expected.filter((model) => findModelInfo("llama.cpp", model)?.providerId === "llama.cpp").sort();
  const presets = PROVIDER_PRESETS.filter((preset) => preset.provider === "llama.cpp").map((preset) => preset.model).sort();
  assert.deepEqual(catalog, expected);
  assert.deepEqual(presets, expected);
  for (const item of manifest) {
    assert.equal(Number.isSafeInteger(item.bytes) && item.bytes > 0, true, item.file);
    assert.match(item.sha256, /^[a-f0-9]{64}$/u, item.file);
  }
});

test("llama.cpp uses its shared chat-template thinking dialect", () => {
  const body = buildProviderRequestBody({
    provider: "llama.cpp",
    model: "gemma-3-12b-it-q4_0.gguf",
    messages: [{ role: "user", content: "hello" }],
    tools: [],
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
  });
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: true });
  assert.deepEqual(body.stream_options, { include_usage: true });
});
