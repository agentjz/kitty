import assert from "node:assert/strict";
import test from "node:test";

import {
  ContextBudgetExceededError,
  buildCompressedContextRequest,
} from "../../src/context/runtime/compression/builder.js";
import type { StoredMessage } from "../../src/types.js";

const config = {
  contextWindowMessages: 120,
  model: "gpt-5.5",
  maxContextChars: 900_000,
  contextSummaryChars: 120_000,
};

test("context request preserves visible conversation while under budget", () => {
  const messages: StoredMessage[] = [
    { id: "m1", role: "user", content: "hello", createdAt: "2026-07-11T00:00:00.000Z" },
    { id: "m2", role: "assistant", content: "hi", createdAt: "2026-07-11T00:00:01.000Z" },
  ];
  const request = buildCompressedContextRequest("system", messages, config);
  assert.equal(request.compressed, false);
  assert.equal(request.messages.length, 3);
  assert.ok(request.estimatedChars <= request.budget.limitChars);
});

test("context compression emits a source-bound epoch", () => {
  const messages: StoredMessage[] = [
    { id: "m1", role: "user", content: `start ${"x".repeat(2_000)}`, createdAt: "2026-07-11T00:00:00.000Z" },
    ...Array.from({ length: 20 }, (_, index): StoredMessage => ({
      id: `m${index + 2}`,
      role: index % 2 === 0 ? "assistant" : "user",
      content: `message ${index} ${"y".repeat(800)}`,
      createdAt: `2026-07-11T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
    })),
  ];
  const request = buildCompressedContextRequest("system", messages, {
    ...config,
    maxContextChars: 4_000,
    contextSummaryChars: 800,
  });
  assert.equal(request.compressed, true);
  assert.match(request.epoch?.sourcePrefixHash ?? "", /^[a-f0-9]{64}$/);
  assert.ok((request.epoch?.sourceMessageCount ?? 0) > 0);
  assert.ok(request.estimatedChars <= request.budget.limitChars);
});

test("context hard limit fails locally instead of sending an oversized request", () => {
  assert.throws(() => buildCompressedContextRequest(
    "s".repeat(4_000),
    [{ id: "m1", role: "user", content: "input", createdAt: "2026-07-11T00:00:00.000Z" }],
    { ...config, maxContextChars: 500, contextSummaryChars: 100 },
  ), ContextBudgetExceededError);
});

test("context compression keeps canonical compact tool recovery evidence", () => {
  const compactView = "bash: error\nROOT_CAUSE\nartifact=.kitty/output.txt; recover with read";
  const messages: StoredMessage[] = [
    { id: "m1", role: "user", content: "run", createdAt: "2026-07-11T00:00:00.000Z" },
    {
      id: "m2",
      role: "tool",
      name: "bash",
      tool_call_id: "call-1",
      content: `full ${"x".repeat(8_000)}`,
      toolResult: {
        callId: "call-1",
        toolName: "bash",
        status: "error",
        summary: "bash failed",
        modelView: `full ${"x".repeat(8_000)}`,
        compactView,
        facts: { exitCode: 1 },
        error: { message: "ROOT_CAUSE" },
        artifacts: [{ kind: "command_output", path: ".kitty/output.txt" }],
        truncation: { truncated: true, strategy: "artifact", originalChars: 20_000, projectedChars: 8_005 },
      },
      createdAt: "2026-07-11T00:00:01.000Z",
    },
    { id: "m3", role: "user", content: "continue", createdAt: "2026-07-11T00:00:02.000Z" },
  ];
  const request = buildCompressedContextRequest("system", messages, {
    ...config,
    maxContextChars: 1_200,
    contextSummaryChars: 200,
  });
  const wire = request.messages.map((message) => String(message.content ?? "")).join("\n");
  assert.match(wire, /ROOT_CAUSE/);
  assert.match(wire, /recover with read/);
  assert.doesNotMatch(wire, /full x{100}/);
});
