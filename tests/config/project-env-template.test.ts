import assert from "node:assert/strict";
import test from "node:test";

import { KITTY_BASE_ENV, KITTY_ENV } from "../../src/config/envKeys.js";
import { getInitialRuntimeConfig } from "../../src/config/initialConfig.js";
import { buildProjectEnvTemplate } from "../../src/config/projectEnvTemplate.js";

test("project env template provides a complete active runtime configuration", () => {
  const initialConfig = getInitialRuntimeConfig();
  const template = buildProjectEnvTemplate(false);
  const local = readEnvAssignments(template);

  assert.deepEqual([...local.keys()].sort(), expectedActiveEnvKeys());
  assert.equal(local.get(KITTY_ENV.apiKey), "");
  assert.equal(local.get(KITTY_ENV.profile), initialConfig.profile);
  assert.equal(local.get(KITTY_ENV.provider), initialConfig.provider);
  assert.equal(local.get(KITTY_ENV.baseUrl), initialConfig.baseUrl);
  assert.equal(local.get(KITTY_ENV.model), initialConfig.model);
  assert.equal(local.get(KITTY_ENV.thinking), initialConfig.thinking);
  assert.equal(local.get(KITTY_ENV.reasoningEffort), initialConfig.reasoningEffort);
});

function readEnvAssignments(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (match) {
      entries.set(match[1]!, match[2]!);
    }
  }
  return entries;
}

function expectedActiveEnvKeys(): string[] {
  return [
    ...Object.values(KITTY_BASE_ENV),
    ...Object.values(KITTY_ENV.extensions),
  ].sort();
}
