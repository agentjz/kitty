import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderRequestBody } from "../../src/provider/chatRequestBody.js";

const toolCall = {
  id: "call-1",
  type: "function" as const,
  function: {
    name: "read",
    arguments: "{\"path\":\"package.json\"}",
  },
};

test("deepseek thinking tool-call replay keeps reasoning_content", () => {
  const body = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: "read package" },
      {
        role: "assistant",
        content: "",
        toolCalls: [toolCall],
        reasoningContent: "Need to inspect package metadata.",
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: "{\"name\":\"kitty\"}",
      },
    ],
    tools: undefined,
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
  });

  const assistantMessage = (body.messages as Array<Record<string, unknown>>)[1]!;
  assert.equal(assistantMessage.reasoning_content, "Need to inspect package metadata.");
  assert.deepEqual(body.thinking, { type: "enabled" });
});

test("deepseek thinking tool-call replay rejects missing reasoning_content", () => {
  assert.throws(
    () => buildProviderRequestBody({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      messages: [
        { role: "user", content: "read package" },
        {
          role: "assistant",
          content: "",
          toolCalls: [toolCall],
        },
        {
          role: "tool",
          toolCallId: "call-1",
          content: "{\"name\":\"kitty\"}",
        },
      ],
      tools: undefined,
      stream: true,
      forceReasoning: false,
      thinking: "enabled",
    }),
    /requires stored reasoning_content/,
  );
});
