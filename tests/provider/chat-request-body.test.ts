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

test("NVIDIA chat request uses NVIDIA reasoning effort without DeepSeek thinking", () => {
  const body = buildProviderRequestBody({
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: [tool],
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "max",
  });

  assert.equal(body.reasoning_effort, "max");
  assert.equal("thinking" in body, false);
  assert.equal(body.tool_choice, "auto");
  assert.deepEqual(body.stream_options, { include_usage: true });
});

test("NVIDIA chat request disables reasoning with none", () => {
  const body = buildProviderRequestBody({
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    stream: false,
    forceReasoning: false,
    thinking: "disabled",
  });

  assert.equal(body.reasoning_effort, "none");
  assert.equal("thinking" in body, false);
  assert.equal("stream_options" in body, false);
});

test("non-replay chat profile never sends stored reasoning_content", () => {
  const body = buildProviderRequestBody({
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-flash",
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

test("GPT-OSS compatible chat requests use reasoning effort without DeepSeek thinking", () => {
  for (const [provider, model] of [
    ["groq", "openai/gpt-oss-120b"],
    ["cerebras", "gpt-oss-120b"],
  ] as const) {
    const body = buildProviderRequestBody({
      provider,
      model,
      messages: [{ role: "user", content: "hello" }],
      tools: [tool],
      stream: true,
      forceReasoning: true,
      thinking: "enabled",
      reasoningEffort: "high",
      maxOutputTokens: 123,
    });

    assert.equal("thinking" in body, false, provider);
    assert.equal(body.reasoning_effort, "high", provider);
    assert.equal(body.max_completion_tokens, 123, provider);
    assert.equal("max_tokens" in body, false, provider);
    assert.equal(body.tool_choice, "auto", provider);
  }
});

test("Gemini compatible chat request uses Gemini reasoning effort and max_tokens", () => {
  const body = buildProviderRequestBody({
    provider: "gemini",
    model: "gemini-2.5-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: [tool],
    stream: true,
    forceReasoning: true,
    thinking: "enabled",
    reasoningEffort: "low",
    maxOutputTokens: 321,
  });

  assert.equal("thinking" in body, false);
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.max_tokens, 321);
  assert.equal("max_completion_tokens" in body, false);
  assert.equal(body.tool_choice, "auto");
});
