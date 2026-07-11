import assert from "node:assert/strict";
import test from "node:test";

import {
  selectCliSession,
  formatRelativeSessionTime,
  formatSessionPickerTitle,
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
    title: "继续整理 README",
    messages: [userMessage("继续整理 README")],
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
  assert.equal(selected?.session.title, "继续整理 README");
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

test("session picker parses choices and formats relative time", () => {
  assert.deepEqual(parseSessionPickerChoice("", 2), { kind: "existing", index: 0 });
  assert.deepEqual(parseSessionPickerChoice("0", 2), { kind: "new" });
  assert.deepEqual(parseSessionPickerChoice("2", 2), { kind: "existing", index: 1 });
  assert.deepEqual(parseSessionPickerChoice("03", 3), { kind: "invalid" });
  assert.equal(formatRelativeSessionTime("2026-06-12T00:09:30.000Z", new Date("2026-06-12T00:10:00.000Z")), "刚刚");
  assert.equal(formatRelativeSessionTime("2026-06-12T00:00:00.000Z", new Date("2026-06-12T00:10:00.000Z")), "10 分钟前");
  assert.equal(formatRelativeSessionTime("2026-06-10T00:00:00.000Z", new Date("2026-06-12T00:00:00.000Z")), "2 天前");
  const longTitle = formatSessionPickerTitle({
    id: "session-long",
    title: "这是一个非常长的历史会话标题，它来自旧的第一轮用户输入，启动列表不应该被它撑开到不可读。",
  });
  assert.equal(Array.from(longTitle).length, 39);
  assert.equal(longTitle.endsWith("..."), true);
});

function userMessage(content: string): StoredMessage {
  return {
    role: "user",
    content,
    createdAt: "2026-06-12T00:00:00.000Z",
  };
}
