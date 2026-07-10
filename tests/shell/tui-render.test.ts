import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTranscriptEntry,
  createInitialTuiState,
  renderTranscriptLineViews,
  type TuiRuntimeDockState,
} from "../../src/shell/tui/store.js";
import { TuiController } from "../../src/shell/tui/controller.js";
import { TUI_COLORS } from "../../src/shell/tui/theme.js";
import { applyComposerInput } from "../../src/shell/tui/composerEditing.js";
import { measureAbsoluteBox } from "../../src/shell/tui/inkGeometry.js";
import {
  composeInkCursorPosition,
  layoutComposer,
  measureComposerContentWidth,
  measureComposerTextOrigin,
} from "../../src/shell/tui/composerLayout.js";
import {
  TUI_FOOTER_CONTENT_INSET_X,
  TUI_FOOTER_META_ROWS,
  TUI_FOOTER_TOP_GAP_ROWS,
  measureTuiFooterRows,
} from "../../src/shell/tui/layout.js";

test("tui runtime dock renders the current scene facts", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createRuntimeDockComponent } = await import("../../src/shell/tui/components/RuntimeDock.js");
  const RuntimeDock = createRuntimeDockComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });
  const dock: TuiRuntimeDockState = {
    activity: {
      kind: "tool",
      channel: "lead",
      status: "running",
      summary: "bash npm.cmd run verify",
      startedAt: 1_000,
      severity: "info",
    },
    background: "background_run 运行中",
    context: "100/1000 chars (10%)",
    model: "deepseek-v4-flash",
  };

  const output = ink.renderToString(React.default.createElement(RuntimeDock, { dock, now: 13_000 }), { columns: 80 });

  assert.match(output, /正在运行：/);
  assert.match(output, /bash npm\.cmd run verify/);
  assert.match(output, /已运行 12s/);
  assert.match(output, /后台/);
  assert.match(output, /background_run 运行中/);
  assert.doesNotMatch(output, /子代理/);
  assert.doesNotMatch(output, /空闲/);
  assert.doesNotMatch(output, /上下文/);
  assert.doesNotMatch(output, /模型/);
});

test("tui runtime dock keeps the stable two-line idle structure without inventing execution facts", async () => {
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
      dock: { context: "0%", model: "deepseek-v4-flash" } satisfies TuiRuntimeDockState,
    }),
    { columns: 80 },
  );

  assert.match(output, /空闲/);
  assert.doesNotMatch(output, /后台/);
  assert.doesNotMatch(output, /子代理/);
  assert.doesNotMatch(output, /上下文/);
  assert.doesNotMatch(output, /模型/);
});

test("tui footer model and runtime dock share the same left anchor", async () => {
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
        } satisfies TuiRuntimeDockState,
        now: 13_000,
      }),
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
  assert.equal(readRenderedColumn(lines, "模型 deepseek-v4-flash"), readRenderedColumn(lines, "空闲"));
  assert.match(output, /上下文 100\/1000 chars \(10%\)$/);
});

test("tui runtime dock renders failed activity without parsing message words", async () => {
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
        activity: {
          kind: "tool",
          channel: "lead",
          status: "failed",
          summary: "edit src/index.ts",
          severity: "error",
        },
      } satisfies TuiRuntimeDockState,
    }),
    { columns: 80 },
  );

  assert.match(output, /失败：edit src\/index\.ts/);
});

test("tui composer renders as the prototype footer input block", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createComposerComponent } = await import("../../src/shell/tui/components/Composer.js");
  let cursorPosition: { x: number; y: number } | undefined;
  const Composer = createComposerComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
    useInput: () => undefined,
    useCursor: () => ({
      setCursorPosition(position: { x: number; y: number } | undefined) {
        cursorPosition = position;
      },
    }),
  });

  const output = ink.renderToString(
    React.default.createElement(Composer, {
      controller: new TuiController(),
      frame: { hasMeasured: false, left: 0, top: 0, width: 80 },
      state: createInitialTuiState(),
    }),
    { columns: 80 },
  );

  assert.equal(cursorPosition, undefined);
  assert.match(output, /┃/);
  assert.match(output, /输入消息/);
  assert.doesNotMatch(output, /Enter 发送/);
  assert.doesNotMatch(output, /> /);
});

test("tui composer layout derives visible rows and cursor from one frame model", () => {
  const frame = { hasMeasured: true, left: 10, top: 20, width: 80 };
  const layout = layoutComposer({
    cursor: 3,
    frame,
    value: "111",
  });

  assert.deepEqual(measureComposerTextOrigin(frame), { x: 10, y: 20 });
  assert.equal(measureComposerContentWidth(frame.width), 73);
  assert.deepEqual(layout.cursor, { x: 13, y: 20 });
  assert.deepEqual(layout.cursorCell, { x: 3, y: 0 });
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
    { x: 8, y: 11 },
  );
  assert.deepEqual(layout.cursorCell, { x: 8, y: 1 });
});

test("tui composer cursor may sit after the last column instead of covering the last character", () => {
  const layout = layoutComposer({
    cursor: "12345".length,
    frame: { hasMeasured: true, left: 2, top: 3, width: 5 },
    value: "12345",
  });

  assert.deepEqual(layout.rows, ["12345"]);
  assert.deepEqual(layout.cursor, { x: 7, y: 3 });
});

test("tui composer cursor uses display width for Chinese input", () => {
  const layout = layoutComposer({
    cursor: "你好".length,
    frame: { hasMeasured: true, left: 1, top: 2, width: 10 },
    value: "你好",
  });

  assert.deepEqual(layout.rows, ["你好"]);
  assert.deepEqual(layout.cursor, { x: 5, y: 2 });
});

test("tui composer separates cursor cell from measured terminal row", () => {
  const layout = layoutComposer({
    cursor: "first\nsecond".length,
    frame: { hasMeasured: true, left: 4, top: 10, width: 20 },
    value: "first\nsecond",
  });

  assert.deepEqual(layout.rows, ["first", "second"]);
  assert.deepEqual(layout.cursorCell, { x: 6, y: 1 });
  assert.deepEqual(layout.cursor, { x: 10, y: 11 });
});

test("tui composer translates measured row into Ink cursor suffix coordinates", () => {
  assert.deepEqual(composeInkCursorPosition({
    cell: { x: 6, y: 1 },
    fallback: { x: 10, y: 11 },
    rowFrame: { hasMeasured: true, left: 4, top: 11, width: 20 },
  }), { x: 10, y: 12 });

  assert.deepEqual(composeInkCursorPosition({
    cell: { x: 6, y: 1 },
    fallback: { x: 10, y: 11 },
    rowFrame: { hasMeasured: false, left: 0, top: 0, width: 20 },
  }), { x: 10, y: 12 });
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

test("tui session picker renders banner and numbered sessions", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTuiSessionPickerComponent } = await import("../../src/shell/tui/sessionPicker.js");
  const Picker = createTuiSessionPickerComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
    useInput: ink.useInput,
    useStdout: ink.useStdout,
  });

  const output = ink.renderToString(
    React.default.createElement(Picker, {
      sessions: [{
        id: "session-1",
        title: "继续改 TUI",
        cwd: process.cwd(),
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
        messageCount: 2,
        messages: [],
      }],
      now: new Date("2026-06-18T00:03:00.000Z"),
      onSelect: () => undefined,
      onCancel: () => undefined,
    }),
    { columns: 120 },
  );

  assert.match(output, /██/);
  assert.equal((output.match(/Kitty Agent/g) ?? []).length, 0);
  assert.match(output, /继续会话/);
  assert.match(output, /0\. 新建会话/);
  assert.match(output, /1\. 继续改 TUI/);
  assert.match(output, /3 分钟前/);
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

test("tui theme uses black surfaces with light gold text accents", () => {
  assert.equal(TUI_COLORS.background, "#05080c");
  assert.equal(TUI_COLORS.panel, "#0d141c");
  assert.equal(TUI_COLORS.panelStrong, "#121d28");
  assert.equal(TUI_COLORS.text, "#fff7e6");
  assert.equal(TUI_COLORS.user, "#f6d58b");
  assert.equal(TUI_COLORS.reasoning, "#bfa977");
  assert.equal(TUI_COLORS.warning, "#f6d58b");
});

test("tui footer height reserves a gap but not a top border row", () => {
  assert.equal(measureTuiFooterRows(1), 8);
});

test("tui footer top gap is a visible background row", () => {
  assert.equal(TUI_FOOTER_TOP_GAP_ROWS, 1);
  assert.equal(TUI_FOOTER_META_ROWS, 1);
  assert.equal(TUI_COLORS.background, "#05080c");
});

test("tui transcript renders an empty first screen without transcript facts", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTranscriptComponent } = await import("../../src/shell/tui/components/Transcript.js");
  const Transcript = createTranscriptComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });

  const output = ink.renderToString(
    React.default.createElement(Transcript, {
      state: createInitialTuiState(),
      viewport: { width: 80, height: 12 },
    }),
    { columns: 100 },
  );

  assert.doesNotMatch(output, /Kitty/);
  assert.doesNotMatch(output, /新会话已就绪/);
  assert.doesNotMatch(output, /输入任务后按 Enter 发送/);
  assert.doesNotMatch(output, /PageUp\/PageDown/);
  assert.doesNotMatch(output, /选择会话/);
});

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
  state = appendTranscriptEntry(state, { role: "subagent", text: "worker answer" }, viewport);
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
  assert.match(output, /worker answer/);
  assert.match(output, /notice/);
});

test("tui transcript reasoning gutter uses the muted reasoning color", () => {
  const rows = renderTranscriptLineViews([{
    id: "entry-1",
    role: "reasoning",
    text: "thinking",
  }], 80);
  const content = rows.find((row) => row.kind === "content");

  assert.equal(content?.style.accent, TUI_COLORS.reasoning);
  assert.equal(content?.style.text, TUI_COLORS.reasoning);
});

test("tui transcript aligns every message role content column", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createTranscriptComponent } = await import("../../src/shell/tui/components/Transcript.js");
  const Transcript = createTranscriptComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
  });
  const viewport = { width: 80, height: 12 };
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, { role: "user", text: "user text" }, viewport);
  state = appendTranscriptEntry(state, { role: "reasoning", text: "thinking text" }, viewport);
  state = appendTranscriptEntry(state, { role: "assistant", text: "assistant text" }, viewport);
  state = appendTranscriptEntry(state, { role: "subagent", text: "subagent text" }, viewport);
  state = appendTranscriptEntry(state, { role: "system", text: "system text" }, viewport);

  const output = ink.renderToString(
    React.default.createElement(Transcript, {
      state,
      viewport,
    }),
    { columns: 100 },
  );
  const lines = output.split("\n");
  const userColumn = readRenderedColumn(lines, "user text");
  const reasoningColumn = readRenderedColumn(lines, "Thinking:");
  const assistantColumn = readRenderedColumn(lines, "assistant text");
  const subagentColumn = readRenderedColumn(lines, "subagent text");
  const systemColumn = readRenderedColumn(lines, "system text");

  assert.equal(userColumn, reasoningColumn);
  assert.equal(assistantColumn, reasoningColumn);
  assert.equal(subagentColumn, reasoningColumn);
  assert.equal(systemColumn, reasoningColumn);
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
  assert.match(output, /标题/);
  assert.match(output, /• 第一项/);
  assert.match(output, /重点/);
  assert.match(output, /code/);
  assert.doesNotMatch(output, /```ts/);
  assert.doesNotMatch(output, /\*\*重点\*\*/);
  assert.match(output, /const ok = true;/);
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
  assert.equal(output.includes("Thinking:"), expectedRows.some((row) => row.prefix === "Thinking: "));
});

function readRenderedColumn(lines: readonly string[], text: string): number {
  const line = lines.find((candidate) => candidate.includes(text));
  assert.ok(line, `expected rendered transcript line to contain ${text}`);
  return line.indexOf(text);
}
