import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { executionOwnership } from "../../src/control/types.js";
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
import { createTempWorkspace, createTestRuntimeConfig, TEST_EXECUTION_OWNER } from "../helpers.js";

test("interactive slash commands expose only the current TUI product surface", () => {
  assert.deepEqual(listSlashCommands("tui").map((command) => command.name), [
    "/status",
    "/export",
    "/exit",
    "/stop",
    "/new",
  ]);
  assert.equal(normalizeLocalCommand("/resume", "tui"), undefined);
  assert.equal(normalizeLocalCommand("/copy", "tui"), undefined);
  assert.equal(normalizeLocalCommand("/reset", "tui"), undefined);
  assert.equal(isExplicitExitCommand("/exit"), true);
  assert.equal(isExplicitExitCommand("quit"), false);
});

test("web slash commands are projected from the shared command definitions", async () => {
  assert.deepEqual(listSlashCommands("web").map((command) => command.name), [
    "/status",
    "/help",
    "/stop",
    "/new",
  ]);
  assert.equal(normalizeLocalCommand("/export", "web"), undefined);
  const context = createLocalCommandContext(process.cwd());
  const output = createRecordingOutput();
  assert.equal(await handleLocalCommand("/help", context, output, "web"), "handled");
  assert.match(output.plainText.join("\n"), /\/new/);
  assert.doesNotMatch(output.plainText.join("\n"), /\/export/);
});

test("status aggregates configuration, background, events, and every discovered skill", async (t) => {
  const root = await createTempWorkspace("local-status", t);
  await fs.mkdir(path.join(root, "skills", "demo"), { recursive: true });
  await fs.writeFile(path.join(root, "skills", "demo", "SKILL.md"), [
    "---",
    "name: demo",
    "description: Demo status skill.",
    "---",
    "# Demo",
  ].join("\n"), "utf8");
  const context = createLocalCommandContext(root);
  const sessionStore = new SessionStore(context.config.paths.sessionsDir);
  context.session = await sessionStore.save(context.session);
  context.sessionStore = sessionStore;

  const backgroundStore = new BackgroundExecutionStore(root);
  const execution = backgroundStore.create({
    ...TEST_EXECUTION_OWNER,
    command: "echo status-background",
    cwd: root,
    requestedBy: "test",
    ownerSessionId: context.session.id,
    createdBySessionId: context.session.id,
  });
  backgroundStore.close(execution.id, executionOwnership(execution), {
    status: "completed",
    output: "status-background",
    summary: "status-background",
  });
  await new SessionEventStore(context.config.paths.eventsDir).append({
    type: "turn.completed",
    sessionId: context.session.id,
    cwd: root,
    host: "test",
  });

  const output = createRecordingOutput();
  assert.equal(await handleLocalCommand("/status", context, output), "handled");
  const status = output.plainText.join("\n");
  assert.match(status, new RegExp(context.config.provider));
  assert.match(status, new RegExp(context.config.model));
  assert.match(status, /status-background/);
  assert.match(status, /turn\.completed/);
  assert.match(status, /demo/);
  assert.doesNotMatch(status, new RegExp(context.config.apiKey));
});

test("export writes the latest visible conversation into the current runtime root", async (t) => {
  const root = await createTempWorkspace("local-export", t);
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

  assert.equal(await handleLocalCommand("/export", context, output), "handled");
  const filePath = path.join(root, `conversation-${context.session.id}.md`);
  const exported = await fs.readFile(filePath, "utf8");
  assert.match(exported, /## User .*\n\nhello/);
  assert.match(exported, /## Assistant Reasoning .*\n\ninspect the evidence/);
  assert.match(exported, /## Assistant .*\n\nfinished reply/);
  assert.match(exported, /latest durable message/);
  assert.doesNotMatch(exported, /wake fact|raw tool evidence/);
  assert.equal(output.infoText[0]?.includes(filePath), true);
  await assert.rejects(() => fs.access(path.join(root, ".kitty", "exports", path.basename(filePath))));
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
      messages: [{ role: "user", source: "external", content: "hello", createdAt: "2026-05-20T00:00:00.000Z" }],
    },
    config: createTestRuntimeConfig(root),
  };
}

function createRecordingOutput(): ShellOutputPort & { plainText: string[]; infoText: string[] } {
  const plainText: string[] = [];
  const infoText: string[] = [];
  return {
    plainText,
    infoText,
    plain: (text) => plainText.push(text),
    info: (text) => infoText.push(text),
    warn: (text) => infoText.push(text),
    error: (text) => infoText.push(text),
    dim: (text) => infoText.push(text),
    heading: (text) => infoText.push(text),
    interrupt: (text) => infoText.push(text),
  };
}
