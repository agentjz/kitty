import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCliProgram } from "../../src/cli/program.js";
import { formatSessionEventForCli, readSessionEventsForCli } from "../../src/cli/commands/events.js";
import { formatCliSetupError } from "../../src/cli/userFacingErrors.js";
import { getAppPaths } from "../../src/config/paths.js";
import { PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME, PROJECT_STATE_ENV_FILE_NAME, PROJECT_STATE_IGNORE_FILE_NAME } from "../../src/project/statePaths.js";
import { BackgroundExecutionStore } from "../../src/execution/background.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { SessionEventStore } from "../../src/session/events.js";
import { SessionStore } from "../../src/session/store.js";
import { createTestRuntimeConfig } from "../helpers.js";
import { invalidConfigValue, missingConfigValue } from "../../src/config/errors.js";
import { KITTY_ENV } from "../../src/config/envKeys.js";

test("cli program exposes current top-level commands", () => {
  const program = buildCliProgram();
  const commands = program.commands.map((command) => command.name());

  for (const name of ["agent", "background", "execution", "resume", "sessions", "events", "config", "init", "status", "changes", "undo", "diff", "doctor", "eval", "telegram", "tui", "version", "__worker__"]) {
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

test("background command lists, reads, waits, and stops executions", async () => {
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
  await program.parseAsync(["-C", root, "background", "read", completed.id], { from: "user" });
  await program.parseAsync(["-C", root, "background", "wait", completed.id], { from: "user" });
  await program.parseAsync(["-C", root, "background", "stop", running.id], { from: "user" });

  assert.equal(store.load(running.id)?.status, "aborted");
});

test("execution command inspects, reads, and cancels delegated executions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-execution-cli-"));
  const config = createTestRuntimeConfig(root);
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      paths: getAppPaths(root),
      overrides: { cwd: root },
      config,
    }),
  }, "en");
  const store = new ExecutionStore(root);
  const completed = store.create({
    kind: "subagent",
    prompt: "inspect",
    cwd: root,
    requestedBy: "lead",
    actorName: "reader",
    actorRole: "explorer",
  });
  store.close(completed.id, {
    status: "completed",
    resultText: "line one\nline two\n",
    summary: "line two",
  });
  const running = store.create({
    kind: "subagent",
    prompt: "long",
    cwd: root,
    requestedBy: "lead",
  });
  store.markRunning(running.id, { pid: process.pid });

  program.exitOverride();
  await program.parseAsync(["-C", root, "execution", "list"], { from: "user" });
  await program.parseAsync(["-C", root, "execution", "inspect", completed.id, "--json"], { from: "user" });
  await program.parseAsync(["-C", root, "execution", "read", completed.id, "--tail", "1"], { from: "user" });
  await program.parseAsync(["-C", root, "execution", "cancel", running.id], { from: "user" });

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
      probe: "models",
      models: 1,
      resolvedBaseUrl: "https://api.deepseek.com",
      probeTimeoutMs: 1000,
    }),
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      paths: getAppPaths(root),
      overrides: { cwd: root },
      config: { ...createTestRuntimeConfig(root), locale: "en" },
    }),
  }, "en");

  program.exitOverride();
  await assert.rejects(
    () => program.parseAsync(["-C", root, "doctor"], { from: "user" }),
    /local project template is incomplete/,
  );
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

test("events command formats tool lifecycle facts directly", () => {
  const formatted = formatSessionEventForCli({
    id: "event-1",
    type: "tool.failed",
    sessionId: "session-1",
    createdAt: "2026-06-24T00:00:00.000Z",
    cwd: "C:\\repo",
    details: {
      toolName: "bash",
      toolCallId: "call-1",
      durationMs: 42,
      changedPathCount: 0,
      error: "COMMAND_FAILED: command failed",
    },
  });

  assert.match(formatted, /tool\.failed/);
  assert.match(formatted, /tool=bash/);
  assert.match(formatted, /call=call-1/);
  assert.match(formatted, /duration=42ms/);
  assert.match(formatted, /changed=0/);
  assert.match(formatted, /error=COMMAND_FAILED: command failed/);
  assert.doesNotMatch(formatted, /details=/);
});

test("cli setup errors explain the bootstrap path", () => {
  const root = path.join(os.tmpdir(), "kitty-missing-env");
  const message = formatCliSetupError(
    invalidConfigValue("KITTY_MAX_OUTPUT_TOKENS", "invalid output token limit"),
    root,
    "en",
  );

  assert.match(message ?? "", /Project is not ready to run/);
  assert.match(message ?? "", /kitty init/);
  assert.match(message ?? "", /kitty doctor/);
  assert.match(message ?? "", /\.kitty[\\/]\.env/);
});

test("cli setup errors explain missing provider key", () => {
  const root = path.join(os.tmpdir(), "kitty-missing-key");
  const message = formatCliSetupError(missingConfigValue(KITTY_ENV.apiKey), root, "en");

  assert.match(message ?? "", /Provider API key is missing/);
  assert.match(message ?? "", /KITTY_API_KEY/);
  assert.match(message ?? "", /kitty doctor/);
});

test("tui command requires an interactive TTY", async () => {
  const program = buildCliProgram({}, "en");

  program.exitOverride();
  await assert.rejects(
    () => program.parseAsync(["tui"], { from: "user" }),
    /需要交互式 TTY/,
  );
});

test("bare kitty opens the terminal UI", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-default-tui-"));
  const config = createTestRuntimeConfig(root);
  let tuiStarted = false;
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      paths: getAppPaths(root),
      overrides: { cwd: root },
      config,
    }),
    startTui: async (options) => {
      tuiStarted = true;
      assert.equal(options.cwd, root);
    },
  });

  program.exitOverride();
  await program.parseAsync([], { from: "user" });

  assert.equal(tuiStarted, true);
});

test("bare kitty with prompt still runs one-shot execution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-default-oneshot-"));
  const config = createTestRuntimeConfig(root);
  let tuiStarted = false;
  let oneShotPrompt = "";
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      paths: getAppPaths(root),
      overrides: { cwd: root },
      config,
    }),
    startTui: async () => {
      tuiStarted = true;
    },
    runOneShot: async (options) => {
      oneShotPrompt = options.prompt;
      return {
        closeout: {
          sessionId: options.session.id,
          completed: true,
          terminalTransition: null,
        },
        session: options.session,
      };
    },
  });

  program.exitOverride();
  await program.parseAsync(["build", "an", "exam", "platform"], { from: "user" });

  assert.equal(tuiStarted, false);
  assert.equal(oneShotPrompt, "build an exam platform");
});

test("explicit tui command uses the shared terminal UI entrypoint", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-explicit-tui-"));
  const config = createTestRuntimeConfig(root);
  let tuiStarted = false;
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      paths: getAppPaths(root),
      overrides: { cwd: root },
      config,
    }),
    startTui: async () => {
      tuiStarted = true;
    },
  });

  program.exitOverride();
  await program.parseAsync(["tui"], { from: "user" });

  assert.equal(tuiStarted, true);
});
