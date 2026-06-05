import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCliProgram } from "../../src/cli/program.js";
import { formatCliSetupError } from "../../src/cli/userFacingErrors.js";
import { PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME, PROJECT_STATE_ENV_FILE_NAME, PROJECT_STATE_IGNORE_FILE_NAME } from "../../src/project/statePaths.js";

test("cli program exposes current top-level commands", () => {
  const program = buildCliProgram();
  const commands = program.commands.map((command) => command.name());

  for (const name of ["agent", "spec", "resume", "sessions", "config", "init", "status", "memory", "changes", "undo", "diff", "doctor", "eval", "telegram", "version", "__worker__"]) {
    assert.equal(commands.includes(name), true, `${name} command should exist`);
  }
  assert.equal(program.helpInformation().includes("__worker__"), false);
});

test("init bootstraps project templates without loading runtime config", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-init-"));
  let runtimeLoaded = false;
  const program = buildCliProgram({
    resolveRuntime: async () => {
      runtimeLoaded = true;
      throw new Error("init must not resolve runtime config");
    },
  });

  program.exitOverride();
  await program.parseAsync(["-C", root, "init"], { from: "user" });

  assert.equal(runtimeLoaded, false);
  assert.equal(fs.existsSync(path.join(root, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME)), true);
  assert.equal(fs.existsSync(path.join(root, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME)), true);
  assert.equal(fs.existsSync(path.join(root, PROJECT_STATE_DIR_NAME, PROJECT_STATE_IGNORE_FILE_NAME)), true);
});

test("cli setup errors explain the bootstrap path", () => {
  const root = path.join(os.tmpdir(), "kitty-missing-env");
  const message = formatCliSetupError(
    new Error("Missing or invalid KITTY_MAX_OUTPUT_TOKENS in the project's .kitty/.env file."),
    root,
  );

  assert.match(message ?? "", /Project is not ready to run/);
  assert.match(message ?? "", /kitty init/);
  assert.match(message ?? "", /kitty doctor/);
  assert.match(message ?? "", /\.kitty[\\/]\.env/);
});

test("cli setup errors explain missing provider key", () => {
  const root = path.join(os.tmpdir(), "kitty-missing-key");
  const message = formatCliSetupError(new Error("API key not found."), root);

  assert.match(message ?? "", /Provider API key is missing/);
  assert.match(message ?? "", /KITTY_API_KEY/);
  assert.match(message ?? "", /kitty doctor/);
});
