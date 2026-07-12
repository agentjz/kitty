import assert from "node:assert/strict";
import test from "node:test";

import { TuiController } from "../../src/shell/tui/controller.js";
import { appendTranscriptEntry, createInitialTuiState, renderTranscriptLineViews } from "../../src/shell/tui/store.js";
import {
  projectMouseSelectionPoint,
  projectSelectedLineViews,
  readSelectedText,
} from "../../src/shell/tui/selection.js";

test("transcript selection copies ordered rendered text across rows", () => {
  const viewport = { width: 40, height: 8 };
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, { role: "assistant", text: "first line\n第二行\nthird line" }, viewport);
  const rows = renderTranscriptLineViews(state.transcript, viewport.width);
  const content = rows.filter((row) => row.kind === "content" && row.text);
  const selection = {
    anchor: { rowId: content[0]!.id, column: 2 },
    focus: { rowId: content[2]!.id, column: 5 },
    dragging: false,
  };

  assert.equal(readSelectedText(rows, selection), "rst line\n第二行\nthird");
  assert.equal(projectSelectedLineViews(rows, selection).filter((row) => "selection" in row).length, 3);
});

test("mouse selection maps terminal cells through transcript framing and wide text", () => {
  const viewport = { width: 40, height: 8 };
  const rows = renderTranscriptLineViews([{ id: "entry-1", role: "assistant", text: "你好abc" }], viewport.width);
  const contentIndex = rows.findIndex((row) => row.kind === "content" && row.text === "你好abc");
  const content = rows[contentIndex]!;
  const bodyStart = 3 + content.frame.marginLeft + content.frame.paddingLeft + 1 + content.frame.gap;
  const point = projectMouseSelectionPoint({
    rows,
    scrollOffset: 0,
    viewport,
    x: bodyStart + 5,
    y: contentIndex + 1,
  });

  assert.equal(point?.rowId, content.id);
  assert.equal(point?.column, 2);
});

test("controller copies a selection without invoking turn interrupt", async () => {
  const copied: string[] = [];
  const controller = new TuiController(undefined, {
    writeClipboard: async (text) => {
      copied.push(text);
    },
  });
  controller.setViewport({ width: 40, height: 8 });
  controller.append("assistant", "copy this line");
  const rows = renderTranscriptLineViews(controller.getState().transcript, 40);
  const contentIndex = rows.findIndex((row) => row.kind === "content" && row.text === "copy this line");
  const content = rows[contentIndex]!;
  const bodyStart = 3 + content.frame.marginLeft + content.frame.paddingLeft + 1 + content.frame.gap;
  let interrupted = 0;
  controller.bindInterrupt(() => {
    interrupted += 1;
  });
  controller.handleMouseEvent({ kind: "press", button: "left", x: bodyStart + 1, y: contentIndex + 1 });
  controller.handleMouseEvent({ kind: "release", button: "left", x: bodyStart + 5, y: contentIndex + 1 });

  assert.equal(controller.copySelection(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copied, ["copy"]);
  assert.equal(interrupted, 0);
  controller.dispose();
});
