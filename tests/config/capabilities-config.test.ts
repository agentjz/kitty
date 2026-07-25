import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_CAPABILITY_CONFIG, normalizeCapabilityConfig } from "../../src/config/capabilities.js";

test("capability config normalizes approved external runtime settings", () => {
  const normalized = normalizeCapabilityConfig(structuredClone(INITIAL_CAPABILITY_CONFIG));
  assert.deepEqual(normalized, INITIAL_CAPABILITY_CONFIG);
  assert.equal(normalized.playwright.headless, false);
});

test("capability config rejects missing or unbounded external settings", () => {
  assert.throws(
    () => normalizeCapabilityConfig({
      playwright: { ...INITIAL_CAPABILITY_CONFIG.playwright, timeoutMs: 1_000_000 },
    }),
    /capabilities\.playwright\.timeoutMs/,
  );
  assert.throws(
    () => normalizeCapabilityConfig({}),
    /capabilities\.playwright/,
  );
});
