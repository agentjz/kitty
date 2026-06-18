import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTranscriptEntry,
  createInitialTuiState,
  type TuiRuntimeDockState,
} from "../../src/shell/tui/store.js";
import { TuiController } from "../../src/shell/tui/controller.js";
import { TUI_COLORS } from "../../src/shell/tui/theme.js";

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
    work: {
      active: true,
      label: "执行工具",
      detail: "background_run",
    },
    background: "background_run 运行中",
    subagent: "空闲",
    context: "100/1000 chars (10%)",
  };

  const output = ink.renderToString(React.default.createElement(RuntimeDock, { dock }), { columns: 80 });

  assert.match(output, /后台任务/);
  assert.match(output, /background_run 运行中/);
  assert.match(output, /子代理/);
  assert.match(output, /上下文/);
});

test("tui composer renders as the prototype footer input block", async () => {
  const React = await import("react");
  const ink = await import("ink");
  const { createComposerComponent } = await import("../../src/shell/tui/components/Composer.js");
  const Composer = createComposerComponent({
    React: React.default,
    Box: ink.Box,
    Text: ink.Text,
    TextArea: (props: { placeholder?: string }) => React.default.createElement(ink.Text, null, props.placeholder ?? ""),
  });

  const output = ink.renderToString(
    React.default.createElement(Composer, {
      controller: new TuiController(),
      state: createInitialTuiState(),
    }),
    { columns: 80 },
  );

  assert.match(output, /┃/);
  assert.match(output, /输入消息/);
  assert.doesNotMatch(output, /Enter 发送/);
  assert.doesNotMatch(output, /> /);
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

  assert.match(output, /kitty agent/i);
  assert.match(output, /0\. 新建会话/);
  assert.match(output, /1\. 继续改 TUI/);
  assert.match(output, /3 分钟前/);
});

test("tui theme uses gold as the primary accent", () => {
  assert.equal(TUI_COLORS.user, "#d6a84f");
  assert.equal(TUI_COLORS.warning, "#d6a84f");
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
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, { role: "user", text: "hello" }, { width: 60, height: 8 });
  state = appendTranscriptEntry(state, { role: "reasoning", text: "thinking" }, { width: 60, height: 8 });
  state = appendTranscriptEntry(state, { role: "assistant", text: "answer" }, { width: 60, height: 8 });
  state = appendTranscriptEntry(state, { role: "system", text: "notice" }, { width: 60, height: 8 });

  const output = ink.renderToString(
    React.default.createElement(Transcript, {
      state,
      viewport: { width: 60, height: 8 },
    }),
    { columns: 80 },
  );

  assert.match(output, /hello/);
  assert.match(output, /thinking/);
  assert.match(output, /answer/);
  assert.match(output, /notice/);
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
  const source = "## 标题\n\n- 第一项\n- 第二项\n\n```ts\nconst ok = true;\n```";
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
  assert.match(output, /## 标题/);
  assert.match(output, /- 第一项/);
  assert.match(output, /```ts/);
  assert.match(output, /const ok = true;/);
});
