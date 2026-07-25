import assert from "node:assert/strict";
import test from "node:test";
import stringWidth from "string-width";

import {
  appendTranscriptEntry,
  createInitialTuiState,
  renderTranscriptLineViews,
  type TuiRuntimeDockState,
} from "../../src/shell/tui/store.js";
import { TuiController } from "../../src/shell/tui/controller.js";
import { applyComposerInput } from "../../src/shell/tui/composerEditing.js";
import { measureAbsoluteBox } from "../../src/shell/tui/inkGeometry.js";
import {
  COMPOSER_FRAME,
  layoutComposer,
  measureComposerContentWidth,
  measureComposerTextOrigin,
} from "../../src/shell/tui/composerLayout.js";
import { readTranscriptRoleFrame } from "../../src/shell/tui/transcriptFrame.js";
import {
  measureTuiFooterRows,
  TUI_COMPOSER_META_GAP_ROWS,
  TUI_DOCK_COMPOSER_GAP_ROWS,
  TUI_FOOTER_CONTENT_INSET_X,
} from "../../src/shell/tui/layout.js";
import { measureTuiOverlayRows } from "../../src/shell/tui/overlayLayout.js";
import {
  TUI_SPINNER_FRAMES,
} from "../../src/shell/tui/animation.js";

test("tui activity spinner stays within one fixed terminal cell", () => {
  assert.deepEqual([...new Set(TUI_SPINNER_FRAMES.map((frame) => stringWidth(frame)))], [1]);
});

test("tui overlays stay within the responsive row budget", () => {
  let state = createInitialTuiState();
  state = { ...state, overlay: { kind: "commandPalette", query: "", selectedIndex: 0 } };
  assert.equal(measureTuiOverlayRows(state, 4), 4);
  state = { ...state, overlay: { kind: "keyboardHelp", offset: 0 } };
  assert.equal(measureTuiOverlayRows(state, 3), 3);
  state = { ...state, overlay: { kind: "historySearch", query: "none", selectedIndex: 0 } };
  assert.equal(measureTuiOverlayRows(state, 6), 2);
});

test("tui command, history, and help overlays render their current facts", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTuiOverlayComponent } = await import("../../src/shell/tui/components/Overlay.js");
  const Overlay = createTuiOverlayComponent({ React: React.default, Box: ink.Box, Text: ink.Text });
  let state = createInitialTuiState();
  state = { ...state, overlay: { kind: "slashCommands", query: "sta", selectedIndex: 0 } };
  const commands = ink.renderToString(React.default.createElement(Overlay, { maxRows: 5, state }), { columns: 80 });
  assert.match(commands, /\/status/);

  state = {
    ...state,
    composer: { ...state.composer, history: ["first prompt", "second prompt"] },
    overlay: { kind: "historySearch", query: "second", selectedIndex: 0 },
  };
  const history = ink.renderToString(React.default.createElement(Overlay, { maxRows: 5, state }), { columns: 80 });
  assert.match(history, /second prompt/);

  state = { ...state, overlay: { kind: "keyboardHelp", offset: 0 } };
  const help = ink.renderToString(React.default.createElement(Overlay, { maxRows: 8, state }), { columns: 80 });
  assert.match(help, /Ctrl\+P/);
});

test("tui footer keeps model and context below the composer", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createFooterMetaComponent } = await import("../../src/shell/tui/components/FooterMeta.js");
  const { createRuntimeDockComponent } = await import("../../src/shell/tui/components/RuntimeDock.js");
  const FooterMeta = createFooterMetaComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });
  const RuntimeDock = createRuntimeDockComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });

  const output = ink.renderToString(
    React.default.createElement(
      ink.Box,
      { flexDirection: "column", paddingX: TUI_FOOTER_CONTENT_INSET_X, width: "100%" },
      React.default.createElement(RuntimeDock, {
        dock: {
          context: "100/1000 chars (10%)",
          turnStartedAt: 10_000,
        } satisfies TuiRuntimeDockState,
        now: 13_000,
      }),
      React.default.createElement(ink.Box, { height: TUI_DOCK_COMPOSER_GAP_ROWS }),
      React.default.createElement(ink.Box, { height: 1 }),
      React.default.createElement(ink.Box, { height: TUI_COMPOSER_META_GAP_ROWS }),
      React.default.createElement(FooterMeta, {
        dock: {
          context: "100/1000 chars (10%)",
          model: "deepseek-v4-flash",
        } satisfies TuiRuntimeDockState,
      }),
    ),
    { columns: 80 },
  );

  const lines = output.split("\n");
  assert.ok(lines[0]?.trim());
  assert.equal(lines[1]?.trim(), "");
  assert.equal(lines[3]?.trim(), "");
  assert.ok(output.trim());
  assert.equal(measureTuiFooterRows(1), 10);
});

test("tui runtime dock truncates long tool activity before the turn clock", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createRuntimeDockComponent } = await import("../../src/shell/tui/components/RuntimeDock.js");
  const RuntimeDock = createRuntimeDockComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });
  const output = ink.renderToString(
    React.default.createElement(RuntimeDock, {
      dock: {
        context: "0%",
        turnStartedAt: 10_000,
        activity: {
          kind: "tool",
          status: "running",
          summary: `bash ${"long-argument ".repeat(20)}TOOL_ARGUMENT_TAIL`,
          severity: "info",
        },
      } satisfies TuiRuntimeDockState,
      now: 13_000,
    }),
    { columns: 42 },
  );

  const lines = output.split("\n");
  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.trim());
  assert.doesNotMatch(output, /TOOL_ARGUMENT_TAIL/);
});

test("tui session picker uses a centered compact identity and fills the terminal", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTuiSessionPickerComponent } = await import("../../src/shell/tui/sessionPicker.js");
  const Picker = createTuiSessionPickerComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
    useInput() {},
    useStdout() {
      return { stdout: { columns: 80, rows: 24 } } as ReturnType<typeof ink.useStdout>;
    },
  });
  const output = ink.renderToString(
    React.default.createElement(Picker, {
      model: "deepseek-v4-flash",
      sessions: [{
        id: "session-1",
        revision: 0,
        createdAt: "2026-07-11T12:00:00.000Z",
        updatedAt: "2026-07-11T13:00:00.000Z",
        cwd: process.cwd(),
        messageCount: 0,
        messages: [],
        title: "SESSION_TITLE",
      }],
      now: new Date("2026-07-11T13:01:00.000Z"),
      onSelect() {},
      onCancel() {},
    }),
    { columns: 80 },
  );
  const lines = output.split(/\r?\n|\r/);

  assert.equal(lines.length, 24);
  assert.equal(Math.max(...lines.map((line) => [...line].length)) <= 80, true);
  assert.ok(output.trim());
});

test("tui compact picker keeps project identity without crowding session choices", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTuiSessionPickerComponent } = await import("../../src/shell/tui/sessionPicker.js");
  const Picker = createTuiSessionPickerComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
    useInput() {},
    useStdout() {
      return { stdout: { columns: 80, rows: 10 } } as ReturnType<typeof ink.useStdout>;
    },
  });
  const sessions = Array.from({ length: 7 }, (_, index) => ({
      id: `session-${index + 1}`,
      revision: 0,
      createdAt: "2026-07-11T12:00:00.000Z",
      updatedAt: "2026-07-11T13:00:00.000Z",
      cwd: process.cwd(),
      messageCount: 0,
      messages: [],
      title: `compact session ${index + 1}`,
    }));
  const output = ink.renderToString(React.default.createElement(Picker, {
    model: "deepseek-v4-flash",
    sessions,
    now: new Date("2026-07-11T13:01:00.000Z"),
    onSelect() {},
    onCancel() {},
  }), { columns: 80 });

  assert.equal(output.split(/\r?\n|\r/).length, 16);
  assert.ok(output.trim());
});

test("tui leaves the welcome layout as soon as a local command returns visible output", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTuiAppComponent } = await import("../../src/shell/tui/components/App.js");
  const controller = new TuiController();
  const App = createTuiAppComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
    useCursor: (() => ({ setCursorPosition() {} })) as unknown as typeof ink.useCursor,
    useInput: (() => undefined) as unknown as typeof ink.useInput,
    usePaste: (() => undefined) as unknown as typeof ink.usePaste,
    useStdin: (() => ({ isRawModeSupported: false, setRawMode() {} })) as unknown as typeof ink.useStdin,
    useStdout: (() => ({ stdout: { columns: 80, rows: 24 } })) as unknown as typeof ink.useStdout,
  } as Parameters<typeof createTuiAppComponent>[0]);
  const props = {
    controller,
    editExternally: async (value: string) => value,
    enableMouseTracking: () => () => undefined,
    redraw() {},
    suspendInput: () => () => undefined,
  };

  const welcome = ink.renderToString(React.default.createElement(App, props), { columns: 80 });
  assert.ok(welcome.trim());

  controller.append("system", "SYSTEM_EVENT");
  const conversation = ink.renderToString(React.default.createElement(App, props), { columns: 80 });
  assert.match(conversation, /SYSTEM_EVENT/);
  assert.notEqual(conversation, welcome);
});

test("tui input and reasoning frames have no visible accent bar", () => {
  assert.equal(COMPOSER_FRAME.gutter, "");
  assert.equal(COMPOSER_FRAME.gap, 0);
  assert.equal(readTranscriptRoleFrame("user", 80).gutter.trim(), "");
  assert.equal(readTranscriptRoleFrame("reasoning", 80).gutter.trim(), "");
});

test("tui composer layout derives visible rows and cursor from one frame model", () => {
  const frame = { hasMeasured: true, left: 10, top: 20, width: 80 };
  const layout = layoutComposer({
    cursor: 3,
    frame,
    value: "111",
  });

  assert.deepEqual(measureComposerTextOrigin(frame), { x: 10, y: 20 });
  assert.equal(measureComposerContentWidth(frame.width), 76);
  assert.deepEqual(layout.cursor, { x: 13, y: 21 });
  assert.deepEqual(layout.rows, ["111"]);
  assert.equal(layout.visibleRows, 1);
});

test("tui composer layout grows for wrapped multiline input and keeps cursor on visible text", () => {
  const frame = { hasMeasured: true, left: 0, top: 10, width: 12 };
  const value = "hello world\n你好世界";
  const layout = layoutComposer({
    cursor: value.length,
    frame,
    value,
  });

  assert.deepEqual(layout.rows, ["hello world", "你好世界"]);
  assert.equal(layout.visibleRows, 2);
  assert.deepEqual(
    layout.cursor,
    { x: 8, y: 12 },
  );
});

test("tui composer cursor may sit after the last column instead of covering the last character", () => {
  const layout = layoutComposer({
    cursor: "12345".length,
    frame: { hasMeasured: true, left: 2, top: 3, width: 5 },
    value: "12345",
  });

  assert.deepEqual(layout.rows, ["12345"]);
  assert.deepEqual(layout.cursor, { x: 7, y: 4 });
});

test("tui composer cursor uses display width for Chinese input", () => {
  const layout = layoutComposer({
    cursor: "你好".length,
    frame: { hasMeasured: true, left: 1, top: 2, width: 10 },
    value: "你好",
  });

  assert.deepEqual(layout.rows, ["你好"]);
  assert.deepEqual(layout.cursor, { x: 5, y: 3 });
});

test("tui composer derives multiline terminal cursor from its measured content frame", () => {
  const layout = layoutComposer({
    cursor: "first\nsecond".length,
    frame: { hasMeasured: true, left: 4, top: 10, width: 20 },
    value: "first\nsecond",
  });

  assert.deepEqual(layout.rows, ["first", "second"]);
  assert.deepEqual(layout.cursor, { x: 10, y: 12 });
});

test("tui composer editor handles common editing keys and explicit multiline insertion", () => {
  let action = applyComposerInput({ cursor: 0, value: "" }, "你", {});
  assert.deepEqual(action, { kind: "update", state: { cursor: 1, value: "你" } });
  action = applyComposerInput(action.state, "好", {});
  assert.deepEqual(action, { kind: "update", state: { cursor: 2, value: "你好" } });
  action = applyComposerInput(action.state, "", { leftArrow: true });
  assert.deepEqual(action, { kind: "update", state: { cursor: 1, value: "你好" } });
  action = applyComposerInput(action.state, "", { backspace: true });
  assert.deepEqual(action, { kind: "update", state: { cursor: 0, value: "好" } });
  action = applyComposerInput(action.state, "", { return: true, shift: true });
  assert.deepEqual(action, { kind: "update", state: { cursor: 1, value: "\n好" } });
  action = applyComposerInput(action.state, "", { return: true });
  assert.deepEqual(action, { kind: "submit", state: { cursor: 0, value: "" }, value: "\n好" });
});

test("tui geometry measures absolute box position through Ink parents", () => {
  const root = createFakeDomElement(0, 0, 100);
  const footer = createFakeDomElement(0, 18, 100, root);
  const composer = createFakeDomElement(2, 3, 96, footer);
  const content = createFakeDomElement(5, 1, 80, composer);

  assert.deepEqual(measureAbsoluteBox(content), {
    hasMeasured: true,
    left: 7,
    top: 22,
    width: 80,
  });
});

test("tui composer gives Ink the same cursor position as its visible text layout", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createComposerComponent } = await import("../../src/shell/tui/components/Composer.js");
  const cursorPositions: Array<{ x: number; y: number } | undefined> = [];
  const Composer = createComposerComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
    useCursor: (() => ({
      setCursorPosition(position: { x: number; y: number } | undefined) {
        cursorPositions.push(position);
      },
    })) as typeof ink.useCursor,
    useInput: (() => undefined) as unknown as typeof ink.useInput,
    usePaste: (() => undefined) as unknown as typeof ink.usePaste,
    useStdin: (() => ({
      isRawModeSupported: false,
      setRawMode() {},
    })) as unknown as typeof ink.useStdin,
  });
  const state = createInitialTuiState();
  const activeState = {
    ...state,
    composer: {
      ...state.composer,
      cursor: 3,
      value: "123",
    },
  };

  ink.renderToString(
    React.default.createElement(Composer, {
      controller: {
        updateComposerVisibleRows() {},
      } as unknown as TuiController,
      editExternally: async (value: string) => value,
      frame: { hasMeasured: true, left: 7, top: 18, width: 20 },
      redraw() {},
      state: activeState,
      suspendInput: () => () => undefined,
    }),
    { columns: 80 },
  );

  assert.deepEqual(cursorPositions[0], { x: 10, y: 19 });
});

test("tui composer routes bracketed paste through the dedicated controller path", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createComposerComponent } = await import("../../src/shell/tui/components/Composer.js");
  let pasteHandler: ((text: string) => void) | undefined;
  const controller = new TuiController();
  const Composer = createComposerComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
    useCursor: (() => ({ setCursorPosition() {} })) as unknown as typeof ink.useCursor,
    useInput: (() => undefined) as unknown as typeof ink.useInput,
    usePaste: ((handler: (text: string) => void) => {
      pasteHandler = handler;
    }) as typeof ink.usePaste,
    useStdin: (() => ({
      isRawModeSupported: false,
      setRawMode() {},
    })) as unknown as typeof ink.useStdin,
  });

  ink.renderToString(React.default.createElement(Composer, {
    controller,
    editExternally: async (value: string) => value,
    frame: { hasMeasured: true, left: 0, top: 0, width: 40 },
    redraw() {},
    state: controller.getState(),
    suspendInput: () => () => undefined,
  }), { columns: 80 });
  assert.ok(pasteHandler);

  pasteHandler("one\r\ntwo");
  assert.equal(controller.getState().composer.value, "one\ntwo");
});

function createFakeDomElement(
  left: number,
  top: number,
  width: number,
  parentNode?: unknown,
): import("ink").DOMElement {
  return {
    attributes: {},
    childNodes: [],
    internal_accessibility: {},
    nodeName: "ink-box",
    parentNode: parentNode as import("ink").DOMElement | undefined,
    style: {},
    yogaNode: {
      getComputedLayout() {
        return {
          bottom: 0,
          height: 1,
          left,
          right: 0,
          top,
          width,
        };
      },
    } as import("ink").DOMElement["yogaNode"],
  };
}

test("tui transcript renders user, reasoning, assistant, and system rows", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTranscriptComponent } = await import("../../src/shell/tui/components/Transcript.js");
  const Transcript = createTranscriptComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });
  const viewport = { width: 60, height: 10 };
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, { role: "user", text: "hello" }, viewport);
  state = appendTranscriptEntry(state, { role: "reasoning", text: "thinking" }, viewport);
  state = appendTranscriptEntry(state, { role: "assistant", text: "answer" }, viewport);
  state = appendTranscriptEntry(state, { role: "system", text: "notice" }, viewport);

  const output = ink.renderToString(
    React.default.createElement(Transcript, {
      state,
      viewport,
    }),
    { columns: 80 },
  );

  assert.match(output, /hello/);
  assert.match(output, /thinking/);
  assert.match(output, /answer/);
  assert.match(output, /notice/);
});

test("tui composer editor moves within multiline text before requesting history", () => {
  const value = "first\nsecond";
  let action = applyComposerInput({ cursor: value.length, value }, "", { upArrow: true });
  assert.equal(action.kind, "update");
  assert.equal(action.state.cursor, 5);
  action = applyComposerInput(action.state, "", { upArrow: true });
  assert.equal(action.kind, "history");
  assert.equal(action.kind === "history" && action.direction, -1);
});

test("tui composer editor uses line boundaries, forward delete, and word movement", () => {
  const value = "first line\nsecond word";
  let action = applyComposerInput({ cursor: value.length, value }, "a", { ctrl: true });
  assert.equal(action.state.cursor, "first line\n".length);
  action = applyComposerInput(action.state, "", { end: true });
  assert.equal(action.state.cursor, value.length);
  action = applyComposerInput(action.state, "", { leftArrow: true, ctrl: true });
  assert.equal(action.state.cursor, value.lastIndexOf("word"));
  action = applyComposerInput(action.state, "", { delete: true });
  assert.equal(action.state.value, "first line\nsecond ord");
});

test("tui transcript renders assistant markdown without changing stored text", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTranscriptComponent } = await import("../../src/shell/tui/components/Transcript.js");
  const Transcript = createTranscriptComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });
  const source = "## 标题\n\n- 第一项\n- 第二项\n\n**重点** 和 `code`\n\n```ts\nconst ok = true;\n```";
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, { role: "assistant", text: source }, { width: 80, height: 12 });

  const output = ink.renderToString(
    React.default.createElement(Transcript, {
      state,
      viewport: { width: 80, height: 12 },
    }),
    { columns: 100 },
  );

  assert.equal(state.transcript[0]?.text, source);
  assert.ok(output.trim());
  assert.doesNotMatch(output, /```/);
  assert.doesNotMatch(output, /\*\*/);
});

test("tui transcript render does not create unmanaged wrapped rows", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTranscriptComponent } = await import("../../src/shell/tui/components/Transcript.js");
  const Transcript = createTranscriptComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });
  const viewport = { width: 36, height: 8 };
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, {
    role: "reasoning",
    text: "Long thinking content should stay inside rows that the transcript layout already counted.",
  }, viewport);
  state = appendTranscriptEntry(state, {
    role: "assistant",
    text: "Long assistant content should not be wrapped a second time by Ink after layout slicing.",
  }, viewport);

  const expectedRows = renderTranscriptLineViews(state.transcript, viewport.width)
    .slice(state.scroll.offset, state.scroll.offset + viewport.height);
  const output = ink.renderToString(
    React.default.createElement(Transcript, {
      state,
      viewport,
    }),
    { columns: viewport.width },
  );

  assert.equal(output.split("\n").length, viewport.height);
  assert.equal(expectedRows.length, viewport.height);
  assert.equal(Math.max(...output.split("\n").map((line) => [...line].length)) <= viewport.width, true);
});
