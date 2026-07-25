import assert from "node:assert/strict";
import test from "node:test";

import { getInitialRuntimeConfig } from "../../src/config/initialConfig.js";
import { MODEL_REASONING_EFFORTS, MODEL_THINKING_MODES } from "../../src/config/modelOptions.js";
import { getDefaultProviderPreset, getProviderPresetBaseUrl } from "../../src/config/providerPresets.js";
import { ConfigError } from "../../src/config/errors.js";
import { normalizeRuntimeConfig } from "../../src/config/schema.js";
import { INITIAL_WEIXIN_CONFIG, resolveWeixinRuntimeConfig } from "../../src/config/hosts.js";

test("runtime config schema normalizes model, context, telegram, and capabilities", () => {
  const defaultPreset = getDefaultProviderPreset();
  const config = getInitialRuntimeConfig();
  const normalized = normalizeRuntimeConfig({
    ...config,
    contextWindowMessages: 1,
    maxContextChars: 1,
    contextSummaryChars: 1,
    maxReadBytes: 1,
    commandStallTimeoutMs: 1,
  });

  assert.equal(normalized.provider, defaultPreset.provider);
  assert.equal(normalized.model, defaultPreset.model);
  assert.equal(config.provider, defaultPreset.provider);
  assert.equal(config.baseUrl, getProviderPresetBaseUrl(defaultPreset));
  assert.equal(config.model, defaultPreset.model);
  assert.equal(config.thinking, defaultPreset.thinking);
  assert.equal(config.reasoningEffort, defaultPreset.reasoningEffort);
  assert.equal(normalized.contextWindowMessages, 6);
  assert.equal(normalized.maxContextChars, 8_000);
  assert.equal(config.contextWindowMessages, 120);
  assert.equal(config.maxContextChars, 900_000);
  assert.equal(config.contextSummaryChars, 120_000);
  assert.equal(config.maxOutputTokens, 384_000);
  assert.equal(normalized.capabilities.playwright.headless, false);
});

test("runtime config schema accepts model option registries from the shared model option source", () => {
  const config = getInitialRuntimeConfig();
  for (const thinking of MODEL_THINKING_MODES) {
    assert.equal(normalizeRuntimeConfig({ ...config, thinking }).thinking, thinking);
  }
  for (const reasoningEffort of MODEL_REASONING_EFFORTS) {
    assert.equal(normalizeRuntimeConfig({ ...config, reasoningEffort }).reasoningEffort, reasoningEffort);
  }
});

test("runtime config schema rejects missing required values instead of hiding defaults", () => {
  const config = getInitialRuntimeConfig();
  assert.throws(
    () => normalizeRuntimeConfig({ ...config, provider: "" }),
    /Missing config value: provider/,
  );
  assert.throws(
    () => normalizeRuntimeConfig({ ...config, provider: "deepseek", model: "not-in-catalog" }),
    (error: unknown) => error instanceof ConfigError
      && error.kind === "invalid"
      && error.key === "KITTY_PROVIDER/KITTY_MODEL",
  );
  assert.throws(
    () => normalizeRuntimeConfig({ ...config, telegram: { ...config.telegram, apiBaseUrl: "" } }),
    /Missing Telegram API base URL/,
  );
  assert.throws(
    () => normalizeRuntimeConfig({
      ...config,
      capabilities: {
        playwright: { ...config.capabilities.playwright, timeoutMs: 1_000_000 },
      },
    }),
    /capabilities\.playwright\.timeoutMs/,
  );
});

test("runtime config schema defaults a missing locale but rejects an explicit unknown locale", () => {
  const config = getInitialRuntimeConfig();
  assert.equal(normalizeRuntimeConfig({ ...config, locale: undefined }).locale, "zh-CN");
  for (const locale of ["zh-CN", "en", "ja", "ko"] as const) {
    assert.equal(normalizeRuntimeConfig({ ...config, locale }).locale, locale);
  }
  assert.throws(
    () => normalizeRuntimeConfig({ ...config, locale: "fr" }),
    /KITTY_LOCALE must be one of/,
  );
});

test("weixin runtime config resolves an omitted section from current defaults", () => {
  const resolved = resolveWeixinRuntimeConfig(undefined, ".");
  assert.equal(resolved.baseUrl, INITIAL_WEIXIN_CONFIG.baseUrl);
  assert.equal(resolved.pollingTimeoutMs, INITIAL_WEIXIN_CONFIG.pollingTimeoutMs);
  assert.deepEqual(resolved.allowedUserIds, []);
  assert.match(resolved.credentialsFile, /[\\/]\.kitty[\\/]weixin[\\/]credentials\.json$/u);
});
