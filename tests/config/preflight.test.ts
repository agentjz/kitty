import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { KITTY_ENV } from "../../src/config/envKeys.js";
import { inspectConfigPreflight } from "../../src/config/preflight.js";
import { buildProjectEnvTemplate } from "../../src/config/projectEnvTemplate.js";
import { getDefaultProviderPreset } from "../../src/config/providerPresets.js";
import { PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME } from "../../src/project/statePaths.js";
import { createTempWorkspace } from "../helpers.js";

test("config preflight reports missing project files without loading runtime", async (t) => {
  const root = await createTempWorkspace("config-preflight-missing", t);
  const report = await inspectConfigPreflight(root);

  assert.equal(report.ready, false);
  assert.equal(report.files.some((file) => file.path.endsWith(`${PROJECT_STATE_DIR_NAME}`) && !file.exists), true);
  assert.equal(report.env.missingKeys.includes(KITTY_ENV.apiKey), true);
  assert.equal(report.env.apiKeyPresent, false);
  assert.deepEqual(report.nextSteps, ["run_init"]);
});

test("config preflight reports current env contract and provider preset", async (t) => {
  const root = await createTempWorkspace("config-preflight-ready", t);
  const kittyDir = path.join(root, PROJECT_STATE_DIR_NAME);
  await fs.mkdir(kittyDir, { recursive: true });
  await fs.writeFile(path.join(kittyDir, PROJECT_STATE_ENV_FILE_NAME), buildProjectEnvTemplate(false).replace(`${KITTY_ENV.apiKey}=`, `${KITTY_ENV.apiKey}=secret`), "utf8");
  await fs.writeFile(path.join(kittyDir, ".env.example"), buildProjectEnvTemplate(true), "utf8");
  await fs.writeFile(path.join(kittyDir, ".kittyignore"), "cache\n", "utf8");

  const report = await inspectConfigPreflight(root);

  assert.equal(report.ready, true);
  assert.equal(report.env.missingKeys.length, 0);
  assert.equal(report.env.apiKeyPresent, true);
  assert.equal(report.env.providerPreset, getDefaultProviderPreset().label);
  assert.deepEqual(report.nextSteps, ["start_kitty"]);
});
