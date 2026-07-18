import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCliProgram } from "../../src/cli/program.js";
import { formatCliSetupError } from "../../src/cli/userFacingErrors.js";
import { getAppPaths } from "../../src/config/paths.js";
import { invalidConfigValue, missingConfigValue } from "../../src/config/errors.js";
import { KITTY_ENV } from "../../src/config/envKeys.js";
import { executionOwnership } from "../../src/control/types.js";
import { BackgroundExecutionStore } from "../../src/execution/background.js";
import { SessionStore } from "../../src/session/store.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_EXAMPLE_FILE_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
  PROJECT_STATE_IGNORE_FILE_NAME,
} from "../../src/project/statePaths.js";
import { createTestRuntimeConfig, TEST_EXECUTION_OWNER } from "../helpers.js";

test("cli exposes only the current public command surface", () => {
  const commands = buildCliProgram().commands.map((command) => command.name()).sort();
  assert.deepEqual(commands, ["background", "resume", "run", "start", "status", "telegram", "undo", "weixin"]);
});

test("start bootstraps project templates and opens the console without a separate init command", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-start-"));
  let runtimeLoaded = false;
  let closed = 0;
  const program = buildCliProgram({
    resolveRuntime: async () => {
      runtimeLoaded = true;
      throw new Error("start initialization must not require valid provider config");
    },
    startLocalConsole: async (cwd) => ({
      url: "http://127.0.0.1:3000/?token=test",
      wait: async () => undefined,
      close: async () => { closed += 1; },
    }),
    openBrowser: () => false,
  });
  program.exitOverride();
  await program.parseAsync(["-C", root, "start"], { from: "user" });
  assert.equal(runtimeLoaded, false);
  assert.equal(closed, 1);
  assert.equal(fs.existsSync(path.join(root, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME)), true);
  assert.equal(fs.existsSync(path.join(root, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME)), true);
  assert.equal(fs.existsSync(path.join(root, PROJECT_STATE_DIR_NAME, PROJECT_STATE_IGNORE_FILE_NAME)), true);
});

test("background command lists, reads, waits, and stops executions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-background-cli-"));
  const config = createTestRuntimeConfig(root);
  const program = buildCliProgram({ resolveRuntime: async () => ({
    cwd: root, stateRootDir: root, paths: getAppPaths(root), overrides: { cwd: root }, config,
  }) });
  const store = new BackgroundExecutionStore(root);
  const completed = store.create({ ...TEST_EXECUTION_OWNER, command: "echo done", cwd: root, requestedBy: "test" });
  store.close(completed.id, executionOwnership(completed), { status: "completed", exitCode: 0, output: "done", summary: "done" });
  const running = store.create({ ...TEST_EXECUTION_OWNER, command: "sleep", cwd: root, requestedBy: "test" });
  store.markRunning(running.id, executionOwnership(running), { pid: process.pid });
  program.exitOverride();
  await program.parseAsync(["-C", root, "background"], { from: "user" });
  await program.parseAsync(["-C", root, "background", "read", completed.id], { from: "user" });
  await program.parseAsync(["-C", root, "background", "wait", completed.id], { from: "user" });
  await program.parseAsync(["-C", root, "background", "stop", running.id], { from: "user" });
  assert.equal(store.load(running.id)?.status, "aborted");
});

test("bare kitty opens a fresh terminal UI and one-shot work requires run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-default-tui-"));
  const config = createTestRuntimeConfig(root);
  let tuiStarts = 0;
  let oneShotPrompt = "";
  const program = buildCliProgram({
    resolveRuntime: async () => ({ cwd: root, stateRootDir: root, paths: getAppPaths(root), overrides: { cwd: root }, config }),
    startTui: async (options) => {
      tuiStarts += 1;
      assert.equal(options.cwd, root);
    },
    runOneShot: async (options) => {
      oneShotPrompt = options.prompt;
      return { closeout: { sessionId: options.session.id, completed: true, terminalTransition: null }, session: options.session };
    },
  });
  program.exitOverride();
  await program.parseAsync([], { from: "user" });
  await program.parseAsync(["run", "build", "an", "exam", "platform"], { from: "user" });
  await assert.rejects(() => program.parseAsync(["build", "an", "exam"], { from: "user" }));
  assert.equal(tuiStarts, 1);
  assert.equal(oneShotPrompt, "build an exam platform");
});

test("resume opens the selected saved session in the interactive CLI", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-resume-cli-"));
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const opened: string[] = [];
  const program = buildCliProgram({
    resolveRuntime: async () => ({ cwd: root, stateRootDir: root, paths: getAppPaths(root), overrides: { cwd: root }, config }),
    startInteractive: async (options) => { opened.push(options.session.id); },
  });
  program.exitOverride();
  await program.parseAsync(["resume", session.id], { from: "user" });
  assert.deepEqual(opened, [session.id]);
});

test("setup errors no longer route users to a removed doctor command", () => {
  const root = path.join(os.tmpdir(), "kitty-setup-error");
  const invalid = formatCliSetupError(invalidConfigValue("KITTY_MAX_OUTPUT_TOKENS", "invalid"), root, "en") ?? "";
  const missing = formatCliSetupError(missingConfigValue(KITTY_ENV.apiKey), root, "en") ?? "";
  assert.match(invalid, /kitty start/);
  assert.match(missing, /KITTY_API_KEY/);
  assert.doesNotMatch(`${invalid}\n${missing}`, /kitty doctor/);
});
