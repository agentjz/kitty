import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderRequestBody } from "../../src/provider/chatRequestBody.js";
import { chatCompletionsAdapter } from "../../src/provider/chatCompletionsAdapter.js";
import { buildCompressedContextRequest } from "../../src/context/runtime/compression/builder.js";
import { runAgentTurn } from "../../src/agent/turn/run.js";
import { InProcessSessionStore } from "../../src/session/store.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import type { AssistantResponse, ModelRequestInput } from "../../src/agent/types.js";
import type { RegisteredTool } from "../../src/tools/core/types.js";

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

test("deepseek streaming tool call preserves empty reasoning_content for replay", async () => {
  const response = await chatCompletionsAdapter.fetchStreaming(createStreamingChatClient([
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "call-1",
            function: {
              name: "read",
              arguments: "{\"path\":\"package.json\"}",
            },
          }],
        },
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 1,
        total_tokens: 101,
        completion_tokens_details: {
          reasoning_tokens: 0,
        },
      },
    },
  ]), {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "read package" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
    thinking: "enabled",
  });

  assert.equal(response.toolCalls.length, 1);
  assert.equal(response.reasoningContent, "");

  const body = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: "read package" },
      {
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
        reasoningContent: response.reasoningContent,
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
  assert.equal(assistantMessage.reasoning_content, "");
});

test("deepseek non-streaming tool call preserves empty reasoning_content for replay", async () => {
  const response = await chatCompletionsAdapter.fetchNonStreaming(createNonStreamingChatClient({
    choices: [{
      message: {
        content: null,
        reasoning_content: "",
        tool_calls: [toolCall],
      },
    }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 1,
      total_tokens: 101,
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  }), {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "read package" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
    thinking: "enabled",
  });

  assert.equal(response.toolCalls.length, 1);
  assert.equal(response.reasoningContent, "");
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

test("agent tool loop replays deepseek reasoning_content into the follow-up request", async (t) => {
  const root = await createTempWorkspace("deepseek-agent-replay", t);
  const config = {
    ...createTestRuntimeConfig(root),
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    thinking: "enabled" as const,
  };
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const requests: ModelRequestInput[] = [];

  await runAgentTurn({
    input: "Read the package metadata and answer with the package name.",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({
      onlyNames: ["read_package_name"],
      sources: [{
        kind: "host",
        id: "test:deepseek-replay",
        tools: [createReadPackageNameTool()],
      }],
    }),
    fetchAssistantResponse: async (request): Promise<AssistantResponse> => {
      requests.push(request);
      if (requests.length === 1) {
        return {
          content: "",
          reasoningContent: "Need to inspect package metadata before answering.",
          toolCalls: [toolCall],
        };
      }
      return {
        content: "The package name is kitty.",
        toolCalls: [],
      };
    },
    fetchSessionTitleResponse: async (): Promise<AssistantResponse> => ({ content: "DeepSeek replay", toolCalls: [] }),
  });

  assert.equal(requests.length, 2);
  const replayedAssistant = requests[1]!.messages.find((message) => message.role === "assistant" && message.toolCalls?.length);
  assert.equal(replayedAssistant?.reasoningContent, "Need to inspect package metadata before answering.");

  const body = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: requests[1]!.messages,
    tools: requests[1]!.tools,
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
  });
  const assistantMessage = (body.messages as Array<Record<string, unknown>>).find((message) => Array.isArray(message.tool_calls));
  assert.equal(assistantMessage?.reasoning_content, "Need to inspect package metadata before answering.");
});

test("context compression keeps deepseek tool-call reasoning_content under hard compaction", () => {
  const request = buildCompressedContextRequest(
    "You are Kitty.",
    [
      { role: "user", content: `old ${"x".repeat(20_000)}`, createdAt: "2026-07-01T00:00:00.000Z" },
      { role: "assistant", content: "Old turn complete.", createdAt: "2026-07-01T00:00:00.500Z" },
      { role: "user", content: "inspect package", createdAt: "2026-07-01T00:00:00.750Z" },
      {
        role: "assistant",
        content: "",
        tool_calls: [toolCall],
        reasoningContent: "Need to inspect package metadata.",
        createdAt: "2026-07-01T00:00:01.000Z",
      },
      {
        role: "tool",
        name: "read",
        tool_call_id: "call-1",
        content: "{\"name\":\"kitty\"}",
        createdAt: "2026-07-01T00:00:02.000Z",
      },
    ],
    {
      contextWindowMessages: 3,
      model: "deepseek-v4-flash",
      provider: "deepseek",
      maxContextChars: 8_000,
      contextSummaryChars: 600,
    },
  );

  const assistant = request.messages.find((message) => message.role === "assistant" && message.toolCalls?.length);
  assert.equal(assistant?.reasoningContent, "Need to inspect package metadata.");
});

test("deepseek context projects unreplayable previous tool batch into assistant fact", () => {
  const request = buildCompressedContextRequest(
    "You are Kitty.",
    [
      { role: "user", content: "inspect package", createdAt: "2026-07-01T00:00:00.000Z" },
      {
        role: "assistant",
        content: "",
        tool_calls: [toolCall],
        createdAt: "2026-07-01T00:00:01.000Z",
      },
      {
        role: "tool",
        name: "read",
        tool_call_id: "call-1",
        content: "{\"name\":\"kitty\"}",
        createdAt: "2026-07-01T00:00:02.000Z",
      },
      { role: "user", content: "continue", createdAt: "2026-07-01T00:01:00.000Z" },
    ],
    {
      contextWindowMessages: 8,
      model: "deepseek-v4-flash",
      provider: "deepseek",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );

  const replayAssistant = request.messages.find((message) =>
    message.role === "assistant" &&
    String(message.content ?? "").includes("Previous tool batch summary."));
  assert.ok(replayAssistant);
  assert.equal(replayAssistant.toolCalls, undefined);
  assert.equal(replayAssistant.reasoningContent, undefined);
  assert.equal(request.messages.some((message) => message.role === "tool" && message.toolCallId === "call-1"), false);

  assert.doesNotThrow(() => buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: request.messages,
    tools: undefined,
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
  }));
});

test("deepseek context does not hide current turn tool-call replay failure", () => {
  const request = buildCompressedContextRequest(
    "You are Kitty.",
    [
      { role: "user", content: "inspect package", createdAt: "2026-07-01T00:00:00.000Z" },
      {
        role: "assistant",
        content: "",
        tool_calls: [toolCall],
        createdAt: "2026-07-01T00:00:01.000Z",
      },
      {
        role: "tool",
        name: "read",
        tool_call_id: "call-1",
        content: "{\"name\":\"kitty\"}",
        createdAt: "2026-07-01T00:00:02.000Z",
      },
    ],
    {
      contextWindowMessages: 8,
      model: "deepseek-v4-flash",
      provider: "deepseek",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );

  const replayAssistant = request.messages.find((message) => message.role === "assistant" && message.toolCalls?.length);
  assert.equal(replayAssistant?.reasoningContent, undefined);
  assert.throws(
    () => buildProviderRequestBody({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      messages: request.messages,
      tools: undefined,
      stream: true,
      forceReasoning: false,
      thinking: "enabled",
    }),
    /requires stored reasoning_content/,
  );
});

function createReadPackageNameTool(): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "read_package_name",
        description: "Return package metadata.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
    },
    execute: async () => ({
      ok: true,
      output: "{\"name\":\"kitty\"}",
    }),
  };
}

function createStreamingChatClient(chunks: unknown[]) {
  return {
    chat: {
      completions: {
        create: async () => chunks,
      },
    },
  } as never;
}

function createNonStreamingChatClient(completion: unknown) {
  return {
    chat: {
      completions: {
        create: async () => completion,
      },
    },
  } as never;
}
