import assert from "node:assert/strict";
import test from "node:test";

import {
  findModelInfo,
  findProviderInfo,
  resolveModelProfile,
} from "../../src/provider/catalog.js";

test("provider and model facts are resolved separately", () => {
  const yls = findProviderInfo("yls");
  const model = findModelInfo("yls", "gpt-5.5");

  assert.equal(yls?.apiKind, "openai-sdk");
  assert.equal(yls?.transport, "relay");
  assert.equal(yls?.defaultBaseUrl, "https://code.ylsagi.com/codex");
  assert.equal(model?.wireApi, "responses");
  assert.equal(model?.capabilities.reasoningContentReplay, "never");
});

test("deepseek model owns reasoning replay capability", () => {
  const profile = resolveModelProfile({
    provider: "deepseek",
    model: "deepseek-v4-flash",
  });

  assert.equal(profile.provider.apiKind, "deepseek-openai-compatible");
  assert.equal(profile.provider.transport, "standard");
  assert.equal(profile.model.wireApi, "chat.completions");
  assert.equal(profile.model.capabilities.reasoningContentReplay, "tool-call-required");
  assert.equal(profile.model.request.reasoningEffortDefault, "max");
});

test("relay providers are explicit provider facts", () => {
  assert.equal(findProviderInfo("yls")?.transport, "relay");
  assert.equal(findProviderInfo("ttapi")?.transport, "relay");
  assert.equal(findProviderInfo("openai")?.transport, "standard");
  assert.equal(findProviderInfo("openai-compatible")?.transport, "standard");
});

test("unknown provider model pair fails clearly", () => {
  assert.throws(
    () => resolveModelProfile({ provider: "yls", model: "deepseek-v4-flash" }),
    /Unknown model for provider yls: deepseek-v4-flash/,
  );
});
