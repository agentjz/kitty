import assert from "node:assert/strict";
import test from "node:test";

import { formatRuntimeUiEventLine } from "../../src/runtime-ui/terminalRenderer.js";
import { createRuntimeUiEvent } from "../../src/runtime-ui/events.js";

test("plain runtime renderer reads typed tool result state instead of formatted text", () => {
  const success = formatRuntimeUiEventLine(createRuntimeUiEvent({
    channel: "agent",
    kind: "tool_result",
    toolName: "bash",
    payload: JSON.stringify({ ok: true, output: "done" }),
    ok: true,
  }), { locale: "ja" });
  assert.equal(success, "");

  const failed = formatRuntimeUiEventLine(createRuntimeUiEvent({
    channel: "agent",
    kind: "tool_result",
    toolName: "bash",
    payload: JSON.stringify({ ok: true, output: "done" }),
    ok: false,
  }), { locale: "ja" });
  assert.ok(failed.trim());
});
