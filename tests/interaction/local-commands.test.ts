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
    "/memory",
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

  const help = output.plainText.join("\n");
  assert.match(help, /Slash commands:/);
  assert.match(help, /Any other input is sent directly to kitty/);
  assert.match(help, /\/status\s+Show current project scene/);
  assert.match(help, /\/background\s+Show background task scene/);
  assert.match(help, /\/memory\s+List runtime memory assets/);
  assert.match(help, /\/skills\s+List runtime skills/);
  assert.match(help, /\/events\s+Show recent session events/);
  assert.match(help, /\/doctor\s+Run local setup preflight/);
  assert.match(help, /\/sessions\s+List recent sessions/);
  assert.match(help, /\/copy\s+Print current session transcript/);
  assert.match(help, /\/export\s+Print current session snapshot JSON/);
  assert.match(help, /\/clear\s+Clear the current prompt in UI shells/);
  assert.match(help, /quit\s+Exit the session/);
  assert.deepEqual(output.infoText, [
    "Current session: session-local-command",
    "model=gpt-5.5 baseUrl=https://api.openai.com/v1",
  ]);
});

test("runtime slash commands are handled locally", async (t) => {
  const root = await createTempWorkspace("local-runtime-commands", t);
  const context = createLocalCommandContext(root);
  const sessionStore = new SessionStore(context.config.paths.sessionsDir, {
    memorySessionsDir: context.config.paths.sessionMemoryDir,
  });
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
  for (const command of ["/status", "/background", "/memory", "/skills", "/events", "/doctor", "/sessions", "/copy", "/export", "/clear"]) {
    assert.equal(await handleLocalCommand(command, context, output), "handled", `${command} should be local`);
  }

  const plain = output.plainText.join("\n");
  assert.match(plain, /Project:/);
  assert.match(plain, /slash-background/);
  assert.match(plain, /No runtime memory assets yet|memory/i);
  assert.match(plain, /No runtime skills discovered|skills:/i);
  assert.match(plain, /turn\.completed/);
  assert.match(plain, /preflight:/);
  assert.match(plain, /session-local-command/);
  assert.match(plain, /user: hello/);
  assert.match(plain, /"id": "session-local-command"/);
  assert.equal(output.infoText.includes("Current prompt cleared."), true);
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
