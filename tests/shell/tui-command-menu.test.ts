import assert from "node:assert/strict";
import test from "node:test";

import {
  filterTuiCommandMenu,
  moveTuiCommandSelection,
  readSlashCommandQuery,
  windowTuiCommandMenu,
} from "../../src/shell/tui/commandMenu.js";
import { TuiController } from "../../src/shell/tui/controller.js";
import { listSlashCommands } from "../../src/interaction/localCommandDefinitions.js";
import type { SessionRecord } from "../../src/types.js";

test("tui command menu projects the shared slash command registry", () => {
  const menu = filterTuiCommandMenu("");
  assert.deepEqual(
    menu.map(({ definitionIndex: _definitionIndex, ...command }) => command),
    listSlashCommands("tui"),
  );
});

test("tui command menu ranks canonical prefix before aliases and descriptions", () => {
  assert.equal(filterTuiCommandMenu("sta")[0]?.name, "/status");
  assert.equal(filterTuiCommandMenu("exp")[0]?.name, "/export");
  assert.equal(filterTuiCommandMenu("sts")[0]?.name, "/status");
  assert.deepEqual(filterTuiCommandMenu("does-not-exist"), []);
});

test("tui command menu reads only a first-line slash token", () => {
  assert.equal(readSlashCommandQuery("/sta", 4), "sta");
  assert.equal(readSlashCommandQuery("/status now", 11), undefined);
  assert.equal(readSlashCommandQuery("hello /sta", 10), undefined);
  assert.equal(readSlashCommandQuery("/sta\nnext", 4), undefined);
});

test("tui command menu selection wraps and keeps selected rows visible", () => {
  assert.equal(moveTuiCommandSelection(3, 0, -1), 2);
  assert.equal(moveTuiCommandSelection(3, 2, 1), 0);
  const commands = filterTuiCommandMenu("");
  const window = windowTuiCommandMenu(commands, 9, 4);
  assert.equal(window.items.length, Math.min(commands.length, 4));
  assert.ok(window.startIndex <= window.selectedIndex);
  assert.ok(window.selectedIndex < window.startIndex + window.items.length);
});

test("slash autocomplete filters, completes without execution, and executes through input queue", async () => {
  const controller = new TuiController();
  const pending = controller.readInput();

  controller.handleComposerInput("/sta", {});
  assert.equal(controller.getState().composer.value, "/sta");
  assert.deepEqual(controller.getState().overlay, {
    kind: "slashCommands",
    query: "sta",
    selectedIndex: 0,
  });

  controller.handleComposerInput("", { tab: true });
  assert.equal(controller.getState().composer.value, "/status");
  assert.equal(controller.getState().overlay.kind, "closed");

  controller.handleComposerInput("", { return: true });
  assert.deepEqual(await pending, { kind: "submit", value: "/status" });
});

test("slash autocomplete escape preserves the draft and does not submit", () => {
  const controller = new TuiController();
  controller.handleComposerInput("/sta", {});
  controller.handleComposerInput("", { escape: true });

  assert.equal(controller.getState().composer.value, "/sta");
  assert.equal(controller.getState().composer.cursor, 4);
  assert.equal(controller.getState().overlay.kind, "closed");
});

test("command palette filters independently and restores the composer after escape", () => {
  const controller = new TuiController();
  controller.handleComposerInput("unfinished task", {});
  controller.handleComposerInput("p", { ctrl: true });
  controller.handleComposerInput("sta", {});

  const overlay = controller.getState().overlay;
  assert.equal(overlay.kind, "commandPalette");
  assert.equal(overlay.kind === "commandPalette" && overlay.query, "sta");
  assert.equal(controller.getState().composer.value, "unfinished task");

  controller.handleComposerInput("", { escape: true });
  assert.equal(controller.getState().overlay.kind, "closed");
  assert.equal(controller.getState().composer.value, "unfinished task");
});

test("command palette enter submits the canonical command through the current reader", async () => {
  const controller = new TuiController();
  const pending = controller.readInput();
  controller.handleComposerInput("p", { ctrl: true });
  controller.handleComposerInput("sta", {});
  controller.handleComposerInput("", { return: true });

  assert.deepEqual(await pending, { kind: "submit", value: "/status" });
  assert.equal(controller.getState().composer.value, "");
});

test("composer history respects multiline movement and restores the stashed draft", () => {
  const controller = new TuiController(createSession(["first", "second"]));
  controller.handleComposerInput("draft", {});
  controller.handleComposerInput("", { upArrow: true });
  assert.equal(controller.getState().composer.value, "second");
  controller.handleComposerInput("", { upArrow: true });
  assert.equal(controller.getState().composer.value, "first");
  controller.handleComposerInput("", { downArrow: true });
  controller.handleComposerInput("", { downArrow: true });
  assert.equal(controller.getState().composer.value, "draft");

  controller.handleComposerInput("\nnext", {});
  const cursorAtEnd = controller.getState().composer.cursor;
  controller.handleComposerInput("", { upArrow: true });
  assert.notEqual(controller.getState().composer.cursor, cursorAtEnd);
  assert.equal(controller.getState().composer.value, "draft\nnext");
});

test("switching to a new session clears transcript and changes the durable draft owner", () => {
  const saved: string[] = [];
  const first = createSession(["old conversation"]);
  const controller = new TuiController(first, {
    draftStore: {
      load: () => undefined,
      save: (sessionId) => { saved.push(sessionId); },
      clear: () => true,
    },
  });
  const second = { ...createSession([]), id: "session-new" };

  controller.switchSession(second);
  controller.handleComposerInput("new draft", {});

  assert.deepEqual(controller.getState().transcript, []);
  assert.deepEqual(controller.getState().composer.history, []);
  assert.equal(saved.at(-1), "session-new");
});

test("selected commands remain queued while the session driver is not reading", async () => {
  const controller = new TuiController();
  controller.handleComposerInput("/sta", {});
  controller.handleComposerInput("", { return: true });

  assert.deepEqual(await controller.readInput(), { kind: "submit", value: "/status" });
});

test("history search filters newest first, accepts without submitting, and preserves draft on escape", () => {
  const controller = new TuiController(createSession(["inspect source", "run tests", "inspect result"]));
  controller.handleComposerInput("current draft", {});
  controller.handleComposerInput("r", { ctrl: true });
  controller.handleComposerInput("inspect", {});
  assert.deepEqual(controller.getState().overlay, {
    kind: "historySearch",
    query: "inspect",
    selectedIndex: 0,
  });
  controller.handleComposerInput("", { return: true });
  assert.equal(controller.getState().composer.value, "inspect result");
  assert.equal(controller.getState().overlay.kind, "closed");

  controller.handleComposerInput("r", { ctrl: true });
  controller.handleComposerInput("", { escape: true });
  assert.equal(controller.getState().composer.value, "inspect result");
});

test("keyboard help owns focus until it closes", () => {
  const controller = new TuiController();
  controller.handleComposerInput("?", {});
  assert.deepEqual(controller.getState().overlay, { kind: "keyboardHelp", offset: 0 });
  assert.equal(controller.getState().composer.value, "");
  controller.handleComposerInput("x", {});
  assert.equal(controller.getState().overlay.kind, "closed");
  assert.equal(controller.getState().composer.value, "x");
});

test("keyboard help scrolls inside the top overlay", () => {
  const controller = new TuiController();
  controller.handleComposerInput("?", {});
  controller.handleComposerInput("", { downArrow: true });
  assert.deepEqual(controller.getState().overlay, { kind: "keyboardHelp", offset: 1 });
  controller.handleComposerInput("", { upArrow: true });
  assert.deepEqual(controller.getState().overlay, { kind: "keyboardHelp", offset: 0 });
});

test("composer restores durable draft and clears it before submission", async () => {
  const saved: Array<{ sessionId: string; cursor: number; value: string }> = [];
  const cleared: string[] = [];
  const session = createSession([]);
  const draftStore = {
    load: () => ({ cursor: 999, value: "restored" }),
    save(sessionId: string, draft: { cursor: number; value: string }) {
      saved.push({ sessionId, ...draft });
    },
    clear(sessionId: string) {
      cleared.push(sessionId);
      return true;
    },
  };
  const controller = new TuiController(session, { draftStore });
  assert.deepEqual(
    { cursor: controller.getState().composer.cursor, value: controller.getState().composer.value },
    { cursor: 8, value: "restored" },
  );
  controller.handleComposerInput("!", {});
  assert.equal(saved.at(-1)?.value, "restored!");
  const pending = controller.readInput();
  controller.handleComposerInput("", { return: true });
  assert.deepEqual(await pending, { kind: "submit", value: "restored!" });
  assert.deepEqual(cleared, [session.id]);
});

test("composer refuses submission when durable draft clearing is unavailable", () => {
  const session = createSession([]);
  const controller = new TuiController(session, {
    draftStore: {
      load: () => ({ cursor: 5, value: "draft" }),
      save() {},
      clear: () => false,
    },
  });
  controller.handleComposerInput("", { return: true });

  assert.equal(controller.getState().composer.value, "draft");
  assert.ok(controller.getState().transcript.at(-1)?.text?.trim());
});

test("composer paste inserts normalized multiline text at the cursor without submitting", () => {
  const saved: Array<{ cursor: number; value: string }> = [];
  const session = createSession([]);
  const controller = new TuiController(session, {
    draftStore: {
      load: () => undefined,
      save(_sessionId, draft) {
        saved.push(draft);
      },
      clear: () => true,
    },
  });
  controller.handleComposerInput("prefixsuffix", {});
  for (let index = 0; index < "suffix".length; index += 1) {
    controller.handleComposerInput("", { leftArrow: true });
  }
  controller.handleComposerInput("p", { ctrl: true });
  assert.equal(controller.getState().overlay.kind, "commandPalette");

  controller.handleComposerPaste("first\r\nsecond\rthird\n");

  assert.equal(controller.getState().overlay.kind, "closed");
  assert.equal(controller.getState().composer.value, "prefixfirst\nsecond\nthird\nsuffix");
  assert.equal(controller.getState().composer.cursor, "prefixfirst\nsecond\nthird\n".length);
  assert.deepEqual(saved.at(-1), {
    cursor: "prefixfirst\nsecond\nthird\n".length,
    value: "prefixfirst\nsecond\nthird\nsuffix",
  });

  const savedCount = saved.length;
  controller.handleComposerPaste("");
  assert.equal(controller.getState().composer.value, "prefixfirst\nsecond\nthird\nsuffix");
  assert.equal(saved.length, savedCount);
});

test("external editor failure preserves the current composer draft", async () => {
  const controller = new TuiController();
  controller.handleComposerInput("keep this", {});
  await controller.editComposerExternally(async () => {
    throw new Error("cannot launch");
  });

  assert.equal(controller.getState().composer.value, "keep this");
  assert.match(controller.getState().transcript.at(-1)?.text ?? "", /cannot launch/);
});

function createSession(inputs: readonly string[]): SessionRecord {
  const createdAt = "2026-07-12T00:00:00.000Z";
  return {
    id: "session-command-history",
    revision: inputs.length,
    createdAt,
    updatedAt: createdAt,
    cwd: process.cwd(),
    messageCount: inputs.length,
    messages: inputs.map((content, index) => ({
      id: `message-${index}`,
      role: "user",
      source: "external",
      content,
      createdAt,
    })),
  };
}
