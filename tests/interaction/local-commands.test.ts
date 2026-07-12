import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { BackgroundExecutionStore } from "../../src/execution/background.js";
import {
  listSlashCommands,
  normalizeLocalCommand,
} from "../../src/interaction/localCommandDefinitions.js";
import { handleLocalCommand, isExplicitExitCommand } from "../../src/interaction/localCommands.js";
import type { ShellOutputPort } from "../../src/interaction/shell.js";
import { SessionEventStore } from "../../src/session/events.js";
import { InProcessSessionStore, SessionStore, type SessionStoreLike } from "../../src/session/store.js";
import type { SessionRecord } from "../../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";
import { InteractiveSessionDriver } from "../../src/interaction/sessionDriver.js";
import { TuiController } from "../../src/shell/tui/controller.js";
import { createTuiInteractionShell } from "../../src/shell/tui/shell.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";

test("slash command metadata comes from the local command registry", () => {
  const commands = listSlashCommands();
  const names = commands.map((command) => command.name);

  for (const name of [
    "/help",
    "/status",
    "/background",
    "/skills",
    "/events",
    "/doctor",
    "/sessions",
    "/copy",
    "/export",
    "/reset",
    "/exit",
  ]) {
    assert.equal(names.includes(name), true, `${name} should be registered`);
  }

  assert.equal(normalizeLocalCommand("/bg"), "background");
  assert.equal(normalizeLocalCommand("/resume"), "sessions");
});

test("local commands classify empty, exit, help, session, and config input", async (t) => {
  const root = await createTempWorkspace("local-commands", t);
  const output = createRecordingOutput();
  const context = createLocalCommandContext(root);

  assert.equal(isExplicitExitCommand(" /QUIT "), true);
  assert.equal(await handleLocalCommand("   ", context, output), "handled");
  assert.equal(await handleLocalCommand("/exit", context, output), "quit");
  assert.equal(await handleLocalCommand("/help", context, output), "handled");
  assert.equal(await handleLocalCommand("/session", context, output), "handled");
  assert.equal(await handleLocalCommand("/config", context, output), "handled");
  assert.equal(await handleLocalCommand("explain this repo", context, output), "continue");

  assert.equal(output.plainText.length, 1);
  assert.equal(output.infoText.length, 2);
});

test("runtime slash commands are handled locally", async (t) => {
  const root = await createTempWorkspace("local-runtime-commands", t);
  const context = createLocalCommandContext(root);
  const sessionStore = new SessionStore(context.config.paths.sessionsDir);
  context.session = await sessionStore.save(context.session);
  context.sessionStore = sessionStore;

  const backgroundStore = new BackgroundExecutionStore(root);
  const execution = backgroundStore.create({
    command: "echo slash-background",
    cwd: root,
    requestedBy: "test",
    sessionId: context.session.id,
  });
  backgroundStore.close(execution.id, {
    status: "completed",
    output: "slash-background",
    summary: "slash-background",
  });

  await new SessionEventStore(context.config.paths.eventsDir).append({
    type: "turn.completed",
    sessionId: context.session.id,
    cwd: root,
    host: "test",
  });

  const output = createRecordingOutput();
  for (const command of ["/status", "/background", "/skills", "/events", "/doctor", "/sessions", "/copy", "/export"]) {
    assert.equal(await handleLocalCommand(command, context, output), "handled", `${command} should be local`);
  }

  assert.equal(output.plainText.length, 7);
  assert.equal(output.infoText.length, 1);
});

test("copy exports visible conversation and assistant reasoning to a session file", async (t) => {
  const root = await createTempWorkspace("local-copy", t);
  const context = createLocalCommandContext(root);
  const sessionStore = new InProcessSessionStore();
  context.sessionStore = sessionStore;
  context.session = await sessionStore.save({
    ...context.session,
    messageCount: 4,
    messages: [
      { role: "user", source: "external", content: "hello", createdAt: "2026-05-20T00:00:00.000Z" },
      { role: "user", source: "internal", content: "wake fact", createdAt: "2026-05-20T00:00:01.000Z" },
      {
        role: "assistant",
        reasoningContent: "inspect the evidence",
        content: "finished reply",
        createdAt: "2026-05-20T00:00:02.000Z",
      },
      { role: "tool", name: "read", content: "raw tool evidence", createdAt: "2026-05-20T00:00:03.000Z" },
    ],
  });
  const staleSession = context.session;
  await sessionStore.save({
    ...context.session,
    messages: [
      ...context.session.messages,
      { role: "user", source: "external", content: "latest durable message", createdAt: "2026-05-20T00:00:04.000Z" },
    ],
  });
  context.session = staleSession;
  const output = createRecordingOutput();

  assert.equal(await handleLocalCommand("/copy", context, output), "handled");
  assert.equal(output.plainText.length, 0);
  assert.equal(output.infoText.length, 1);

  const filePath = path.join(getProjectStatePaths(root).exportsDir, `conversation-${context.session.id}.md`);
  const exported = await fs.readFile(filePath, "utf8");
  assert.match(exported, /## User .*\n\nhello/);
  assert.match(exported, /## Assistant Reasoning .*\n\ninspect the evidence/);
  assert.match(exported, /## Assistant .*\n\nfinished reply/);
  assert.match(exported, /## User .*\n\nlatest durable message/);
  assert.doesNotMatch(exported, /wake fact|raw tool evidence/);
  assert.equal(output.infoText[0]?.includes(filePath), true);
});

test("session driver owns destructive command confirmation for every interactive shell", async (t) => {
  const root = await createTempWorkspace("local-command-confirmation", t);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const controller = new TuiController();
  const handled: string[] = [];
  controller.submitInput("/reset");
  controller.submitInput("not-reset");
  controller.submitInput("/exit");

  const driver = new InteractiveSessionDriver({
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    shell: createTuiInteractionShell(controller),
    stateRootDir: root,
    localCommandHandler: async (input) => {
      handled.push(input);
      return input === "/exit" ? "quit" : "handled";
    },
  });
  await driver.run();

  assert.deepEqual(handled, ["/exit"]);
  assert.match(controller.getState().transcript.map((entry) => entry.text).join("\n"), /已取消重置/);
});

test("session driver runs a destructive command only after exact confirmation", async (t) => {
  const root = await createTempWorkspace("local-command-confirmed", t);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const controller = new TuiController();
  const handled: string[] = [];
  controller.submitInput("/reset");
  controller.submitInput("reset");

  const driver = new InteractiveSessionDriver({
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    shell: createTuiInteractionShell(controller),
    stateRootDir: root,
    localCommandHandler: async (input) => {
      handled.push(input);
      return "quit";
    },
  });
  await driver.run();

  assert.deepEqual(handled, ["/reset"]);
});

function createLocalCommandContext(root: string): {
  cwd: string;
  stateRootDir: string;
  session: SessionRecord;
  config: ReturnType<typeof createTestRuntimeConfig>;
  sessionStore?: SessionStoreLike;
} {
  return {
    cwd: root,
    stateRootDir: root,
    session: {
      id: "session-local-command",
      revision: 0,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      cwd: root,
      messageCount: 1,
      messages: [{
        role: "user",
        content: "hello",
        createdAt: "2026-05-20T00:00:00.000Z",
      }],
    },
    config: createTestRuntimeConfig(root),
  };
}

function createRecordingOutput(): ShellOutputPort & {
  plainText: string[];
  infoText: string[];
} {
  const plainText: string[] = [];
  const infoText: string[] = [];
  return {
    plainText,
    infoText,
    plain: (text) => plainText.push(text),
    info: (text) => infoText.push(text),
    warn: () => undefined,
    error: () => undefined,
    dim: () => undefined,
    heading: () => undefined,
    interrupt: () => undefined,
  };
}
