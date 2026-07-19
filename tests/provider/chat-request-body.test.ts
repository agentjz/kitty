import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderRequestBody } from "../../src/provider/chatRequestBody.js";

const tool = {
  type: "function" as const,
  function: {
    name: "read_package_name",
    description: "Read package name.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
};

test("Agnes chat request uses chat template thinking without reasoning effort", () => {
  const body = buildProviderRequestBody({
    provider: "agnes",
    model: "agnes-2.0-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: [tool],
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "max",
    maxOutputTokens: 384_000,
  });

  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: true });
  assert.equal("reasoning_effort" in body, false);
  assert.equal("thinking" in body, false);
  assert.equal(body.max_tokens, 65_500);
  assert.equal(body.tool_choice, "auto");
  assert.deepEqual(body.stream_options, { include_usage: true });
});

test("Agnes chat request can disable chat template thinking", () => {
  const body = buildProviderRequestBody({
    provider: "agnes",
    model: "agnes-2.0-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    stream: false,
    forceReasoning: true,
    thinking: "disabled",
  });

  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
  assert.equal("reasoning_effort" in body, false);
  assert.equal("stream_options" in body, false);
});

test("chat request omits an empty tool surface", () => {
  const body = buildProviderRequestBody({
    provider: "agnes",
    model: "agnes-2.0-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: [],
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
  });

  assert.equal("tools" in body, false);
  assert.equal("tool_choice" in body, false);
});

test("non-replay chat profile never sends stored reasoning_content", () => {
  const body = buildProviderRequestBody({
    provider: "agnes",
    model: "agnes-2.0-flash",
    messages: [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "",
        reasoningContent: "internal reasoning",
        toolCalls: [{
          id: "call-1",
          type: "function",
          function: {
            name: "read_package_name",
            arguments: "{}",
          },
        }],
      },
    ],
    tools: [tool],
    stream: true,
    forceReasoning: false,
  });

  const assistant = (body.messages as Array<Record<string, unknown>>)[1]!;
  assert.equal("reasoning_content" in assistant, false);
});
