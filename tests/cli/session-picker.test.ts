import assert from "node:assert/strict";
import test from "node:test";

import {
  selectCliSession,
  parseSessionPickerChoice,
} from "../../src/cli/commands/sessionPicker.js";
import { getAppPaths } from "../../src/config/paths.js";
import { SessionStore } from "../../src/session/store.js";
import type { StoredMessage } from "../../src/types.js";
import { createTempWorkspace } from "../helpers.js";

test("session picker creates a new session when no sessions exist", async (t) => {
  const root = await createTempWorkspace("session-picker-empty", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);

  const selected = await selectCliSession({
    cwd: root,
    cwdOverridden: false,
    sessionStore: store,
    io: {
      readChoice: async () => {
        throw new Error("empty history should not prompt");
      },
    },
  });

  assert.equal(selected?.cwd, root);
  assert.equal(selected?.session.cwd, root);
  assert.equal(selected?.session.messageCount, 0);
});

test("session picker resumes numbered session and follows its cwd", async (t) => {
  const root = await createTempWorkspace("session-picker-resume", t);
  const otherRoot = await createTempWorkspace("session-picker-old-cwd", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  await store.save({
    ...(await store.create(otherRoot)),
    title: "session-title",
    messages: [userMessage("session-input")],
  });
  const lines: string[] = [];

  const selected = await selectCliSession({
    cwd: root,
    cwdOverridden: false,
    sessionStore: store,
    io: {
      writeLine: (line = "") => lines.push(line),
      readChoice: async () => "1",
      now: () => new Date("2026-06-12T00:10:00.000Z"),
    },
  });

  assert.equal(selected?.cwd, otherRoot);
  assert.ok(selected?.session.title?.trim());
  assert.ok(lines.length > 0);
});

test("session picker can create a fresh session from choice zero", async (t) => {
  const root = await createTempWorkspace("session-picker-new", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  const oldSession = await store.save({
    ...(await store.create(root)),
    messages: [userMessage("旧会话")],
  });

  const selected = await selectCliSession({
    cwd: root,
    cwdOverridden: false,
    sessionStore: store,
    io: {
      writeLine: () => undefined,
      readChoice: async () => "0",
    },
  });

  assert.notEqual(selected?.session.id, oldSession.id);
  assert.equal(selected?.session.messageCount, 0);
});

test("session picker retries invalid input and cancels on closed input", async (t) => {
  const root = await createTempWorkspace("session-picker-retry", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  await store.save({
    ...(await store.create(root)),
    messages: [userMessage("已有会话")],
  });
  const answers = ["abc", null] as Array<string | null>;
  const lines: string[] = [];

  const selected = await selectCliSession({
    cwd: root,
    cwdOverridden: false,
    sessionStore: store,
    io: {
      writeLine: (line = "") => lines.push(line),
      readChoice: async () => answers.shift() ?? null,
    },
  });

  assert.equal(selected, null);
  assert.ok(lines.length > 0);
});

test("session picker parses choices", () => {
  assert.deepEqual(parseSessionPickerChoice("", 2), { kind: "existing", index: 0 });
  assert.deepEqual(parseSessionPickerChoice("0", 2), { kind: "new" });
  assert.deepEqual(parseSessionPickerChoice("2", 2), { kind: "existing", index: 1 });
  assert.deepEqual(parseSessionPickerChoice("03", 3), { kind: "invalid" });
});

function userMessage(content: string): StoredMessage {
  return {
    role: "user",
    content,
    createdAt: "2026-06-12T00:00:00.000Z",
  };
}
