import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCliProgram } from "../../src/cli/program.js";
import { readSessionEventsForCli } from "../../src/cli/commands/events.js";
import { formatCliSetupError } from "../../src/cli/userFacingErrors.js";
import { getAppPaths } from "../../src/config/paths.js";
import { PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME, PROJECT_STATE_ENV_FILE_NAME, PROJECT_STATE_IGNORE_FILE_NAME } from "../../src/project/statePaths.js";
import { BackgroundExecutionStore } from "../../src/execution/background.js";
import { SessionEventStore } from "../../src/session/events.js";
import { SessionStore } from "../../src/session/store.js";
import { createTestRuntimeConfig } from "../helpers.js";

test("cli program exposes current top-level commands", () => {
  const program = buildCliProgram();
  const commands = program.commands.map((command) => command.name());

  for (const name of ["agent", "spec", "background", "resume", "sessions", "events", "config", "init", "status", "memory", "changes", "undo", "diff", "doctor", "eval", "telegram", "version", "__worker__"]) {
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
  const env = fs.readFileSync(path.join(root, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME), "utf8");
  assert.match(env, /KITTY_API_KEY/);
});

test("background command lists, waits, and stops executions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-background-cli-"));
  const config = createTestRuntimeConfig(root);
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      paths: getAppPaths(root),
      overrides: { cwd: root },
      config,
    }),
  });
  const store = new BackgroundExecutionStore(root);
  const completed = store.create({
    command: "echo done",
    cwd: root,
    requestedBy: "test",
  });
  store.close(completed.id, {
    status: "completed",
    exitCode: 0,
    output: "done",
    summary: "done",
  });
  const running = store.create({
    command: "sleep",
    cwd: root,
    requestedBy: "test",
  });
  store.markRunning(running.id, { pid: process.pid });

  program.exitOverride();
  await program.parseAsync(["-C", root, "background"], { from: "user" });
  await program.parseAsync(["-C", root, "background", "wait", completed.id], { from: "user" });
  await program.parseAsync(["-C", root, "background", "stop", running.id], { from: "user" });

  assert.equal(store.load(running.id)?.status, "aborted");
});

test("doctor prints preflight facts before runtime loading", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-doctor-preflight-"));
  let runtimeLoaded = false;
  const program = buildCliProgram({
    resolveRuntime: async () => {
      runtimeLoaded = true;
      throw new Error("runtime unavailable");
    },
  });

  program.exitOverride();
  await assert.rejects(
    () => program.parseAsync(["-C", root, "doctor"], { from: "user" }),
    /runtime unavailable/,
  );

  assert.equal(runtimeLoaded, true);
});

test("doctor does not report ready when local project template is incomplete", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-doctor-incomplete-"));
  const program = buildCliProgram({
    probeProviderConnection: async () => ({
      kind: "ok",
      models: 1,
      resolvedBaseUrl: "https://api.deepseek.com",
      probeTimeoutMs: 1000,
    }),
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      paths: getAppPaths(root),
      overrides: { cwd: root },
      config: createTestRuntimeConfig(root),
    }),
  });

  program.exitOverride();
  await assert.rejects(
    () => program.parseAsync(["-C", root, "doctor"], { from: "user" }),
    /local project template is incomplete/,
  );
});

test("eval command can run local checks", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-eval-run-"));
  const program = buildCliProgram();

  program.exitOverride();
  await program.parseAsync(["-C", root, "eval", "--run"], { from: "user" });
});

test("events command reads latest session event facts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-events-"));
  const paths = getAppPaths(root);
  const sessionStore = new SessionStore(paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  await new SessionEventStore(paths.eventsDir).append({
    type: "turn.completed",
    sessionId: session.id,
    cwd: root,
    host: "test",
    details: {
      changedPathCount: 0,
    },
  });
  const result = await readSessionEventsForCli({
    cwd: root,
    paths,
    limit: 20,
  });

  assert.equal(result.sessionId, session.id);
  assert.equal(result.events[0]?.type, "turn.completed");
  assert.equal(result.events[0]?.host, "test");
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
