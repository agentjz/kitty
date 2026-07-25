import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionConversationBrief,
  buildSessionConversationBriefBlock,
} from "../../src/context/runtime/sessionBrief/build.js";
import type { StoredMessage } from "../../src/types.js";

test("session brief projects durable turn counts and tool activity without copying old text", () => {
  const messages: StoredMessage[] = [
    { role: "user", content: "private historical requirement", createdAt: "2026-05-21T10:00:00.000Z" },
    {
      role: "assistant",
      content: "running a read",
      tool_calls: [{
        id: "call-1",
        type: "function",
        function: { name: "read", arguments: "{\"path\":\"spec.md\"}" },
      }],
      createdAt: "2026-05-21T10:00:01.000Z",
    },
    { role: "tool", name: "read", tool_call_id: "call-1", content: "result", createdAt: "2026-05-21T10:00:02.000Z" },
    { role: "user", content: "continue", createdAt: "2026-05-21T10:00:03.000Z" },
  ];

  const brief = buildSessionConversationBrief({
    messages,
    timestamp: "2026-05-21T10:00:04.000Z",
  });
  const block = buildSessionConversationBriefBlock(brief);

  assert.equal(brief?.userTurnCount, 2);
  assert.equal(brief?.assistantTurnCount, 1);
  assert.equal(brief?.toolActivity.length, 1);
  assert.ok(block?.trim());
  assert.doesNotMatch(block ?? "", /private historical requirement/);
});

test("session brief is absent when there are no visible durable turns", () => {
  assert.equal(buildSessionConversationBriefBlock(buildSessionConversationBrief({ messages: [] })), undefined);
});
