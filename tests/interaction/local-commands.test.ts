import assert from "node:assert/strict";
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
    "/clear",
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
  for (const command of ["/status", "/background", "/skills", "/events", "/doctor", "/sessions", "/copy", "/export", "/clear"]) {
    assert.equal(await handleLocalCommand(command, context, output), "handled", `${command} should be local`);
  }

  assert.equal(output.plainText.length, 8);
  assert.equal(output.infoText.length, 1);
});

function createLocalCommandContext(root: string): {
  cwd: string;
  session: SessionRecord;
  config: ReturnType<typeof createTestRuntimeConfig>;
  sessionStore?: SessionStoreLike;
} {
  return {
    cwd: root,
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
