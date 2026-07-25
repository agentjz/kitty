import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import dotenv from "dotenv";

import { initializeProjectFiles } from "../../src/config/init.js";
import { KITTY_ENV } from "../../src/config/envKeys.js";
import { createTempWorkspace } from "../helpers.js";

test("init adds missing current settings without replacing existing env values", async (t) => {
  const root = await createTempWorkspace("init-reconcile", t);
  const kittyDir = path.join(root, ".kitty");
  const envPath = path.join(kittyDir, ".env");
  const examplePath = path.join(kittyDir, ".env.example");
  const ignorePath = path.join(kittyDir, ".kittyignore");
  const skillsDir = path.join(root, "skills");
  await fs.mkdir(kittyDir, { recursive: true });
  await fs.writeFile(envPath, "KITTY_API_KEY=keep-secret\nCUSTOM_SETTING=keep-me\n", "utf8");
  await fs.writeFile(examplePath, "KITTY_API_KEY=keep-placeholder\n", "utf8");
  await fs.writeFile(ignorePath, "custom-cache/\n", "utf8");

  const first = await initializeProjectFiles(root);
  assert.deepEqual(first.created, [skillsDir]);
  assert.deepEqual(first.updated.sort(), [envPath, examplePath].sort());
  assert.deepEqual(first.skipped, [ignorePath]);
  assert.equal(first.preflight.env.missingKeys.length, 0);

  const envContent = await fs.readFile(envPath, "utf8");
  const env = dotenv.parse(envContent);
  assert.equal(env[KITTY_ENV.apiKey], "keep-secret");
  assert.equal(env.CUSTOM_SETTING, "keep-me");
  assert.equal(Object.keys(env).filter((key) => key.startsWith("KITTY_WEIXIN_")).length, 9);
  assert.equal(dotenv.parse(await fs.readFile(examplePath, "utf8"))[KITTY_ENV.apiKey], "keep-placeholder");
  assert.equal(await fs.readFile(ignorePath, "utf8"), "custom-cache/\n");

  const second = await initializeProjectFiles(root);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.updated, []);
  assert.deepEqual(second.skipped.sort(), [envPath, examplePath, ignorePath, skillsDir].sort());
});
