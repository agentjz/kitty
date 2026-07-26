import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderRequestBody } from "../../src/provider/chatRequestBody.js";
import { mapLlm2apiCapabilities } from "../../src/provider/llm2apiModels.js";

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

test("LLM2API request uses only dynamically discovered relay public capabilities", () => {
  const capabilities = mapLlm2apiCapabilities("agnes-2.0-flash", {
    streaming: true,
    tools: {
      function_calling: true,
      tool_choice: ["auto", "function"],
      streaming_tool_calls: false,
    },
    reasoning: {
      enabled: true,
      configurable: true,
      default_enabled: true,
      efforts: ["max"],
      preserve: false,
    },
    usage: {
      stream: true,
    },
    limits: {
      output_tokens: 65_500,
    },
  });
  const body = buildProviderRequestBody({
    provider: "llm2api",
    model: "agnes-2.0-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: [tool],
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "max",
    maxOutputTokens: 384_000,
    capabilities,
  });

  assert.deepEqual(body.thinking, { type: "enabled" });
  assert.equal("chat_template_kwargs" in body, false);
  assert.equal(body.reasoning_effort, "max");
  assert.equal(body.max_tokens, 65_500);
  assert.equal(body.tool_choice, "auto");
  assert.deepEqual(body.stream_options, { include_usage: true });
});

test("Google Gemini sends supported reasoning effort, schema, and thought signature", () => {
  const body = buildProviderRequestBody({
    provider: "google",
    model: "gemini-3.5-flash",
    messages: [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{
          id: "call-1",
          type: "function",
          providerMetadata: {
            google: { thought_signature: "signed-thought" },
          },
          function: { name: "read_package_name", arguments: "{}" },
        }],
      },
      { role: "tool", content: "kitty", toolCallId: "call-1" },
    ],
    tools: [{
      ...tool,
      function: {
        ...tool.function,
        parameters: {
          type: "object",
          properties: {
            value: { type: ["string", "null"] },
          },
          required: ["value"],
          additionalProperties: false,
        },
      },
    }],
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "max",
    maxOutputTokens: 384_000,
  });

  assert.equal(body.reasoning_effort, "high");
  assert.equal(body.max_tokens, 65_536);
  const assistant = (body.messages as Array<Record<string, unknown>>)[1]!;
  const replayedCall = (assistant.tool_calls as Array<Record<string, unknown>>)[0]!;
  assert.deepEqual(replayedCall.extra_content, {
    google: { thought_signature: "signed-thought" },
  });
  const sentTool = (body.tools as Array<{ function: { parameters: Record<string, unknown> } }>)[0]!;
  assert.deepEqual(
    (sentTool.function.parameters.properties as Record<string, unknown>).value,
    { type: "string", nullable: true },
  );
});

test("Google Gemini minimizes always-on thinking when the shared toggle is disabled", () => {
  const body = buildProviderRequestBody({
    provider: "google",
    model: "gemini-3.5-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    stream: false,
    forceReasoning: false,
    thinking: "disabled",
    reasoningEffort: "high",
  });

  assert.equal(body.reasoning_effort, "minimal");
});

test("Google Gemini rejects tool replay without its thought signature", () => {
  assert.throws(() => buildProviderRequestBody({
    provider: "google",
    model: "gemini-3.5-flash",
    messages: [{
      role: "assistant",
      content: "",
      toolCalls: [{
        id: "call-1",
        type: "function",
        providerMetadata: { vendor: { opaque: "not-a-google-signature" } },
        function: { name: "read_package_name", arguments: "{}" },
      }],
    }],
    tools: [tool],
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
  }), /stored thought signature/u);
});

test("Zhipu chat request enables preserved thinking and replays reasoning content", () => {
  const body = buildProviderRequestBody({
    provider: "zhipu",
    model: "glm-4.7-flash",
    messages: [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "",
        reasoningContent: "Need current workspace facts.",
        toolCalls: [{
          id: "call-1",
          type: "function",
          function: {
            name: "read_package_name",
            arguments: "{}",
          },
        }],
      },
      { role: "tool", content: "kitty", toolCallId: "call-1" },
    ],
    tools: [tool],
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "max",
    maxOutputTokens: 384_000,
  });

  assert.deepEqual(body.thinking, { type: "enabled", clear_thinking: false });
  assert.equal("reasoning_effort" in body, false);
  assert.equal(body.max_tokens, 131_072);
  assert.equal(body.tool_choice, "auto");
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(
    (body.messages as Array<Record<string, unknown>>)[1]?.reasoning_content,
    "Need current workspace facts.",
  );
});

test("Zhipu chat request can disable thinking without preserved-thinking options", () => {
  const body = buildProviderRequestBody({
    provider: "zhipu",
    model: "glm-4.7-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    stream: false,
    forceReasoning: false,
    thinking: "disabled",
  });

  assert.deepEqual(body.thinking, { type: "disabled" });
});

test("GLM-5.2 sends its reasoning effort while GLM-4.7 Flash keeps the legacy wire contract", () => {
  const glm52 = buildProviderRequestBody({
    provider: "zhipu",
    model: "glm-5.2",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "high",
  });
  const glm47Flash = buildProviderRequestBody({
    provider: "zhipu",
    model: "glm-4.7-flash",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "high",
  });

  assert.equal(glm52.reasoning_effort, "high");
  assert.equal("reasoning_effort" in glm47Flash, false);
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
