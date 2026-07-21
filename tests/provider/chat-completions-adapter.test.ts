import assert from "node:assert/strict";
import test from "node:test";

import { chatCompletionsAdapter } from "../../src/provider/chatCompletionsAdapter.js";

test("chat completions streaming passes abort signal as SDK options", async () => {
  const controller = new AbortController();
  const calls: Array<{ body: Record<string, unknown>; options: Record<string, unknown> | undefined }> = [];
  const client = createClient(async (body, options) => {
    calls.push({ body, options });
    return [{
      choices: [{ delta: { content: "ok" } }],
    }];
  });

  const response = await chatCompletionsAdapter.fetchStreaming(client, {
    provider: "openai-compatible",
    model: "community/free-model",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
    thinking: "disabled",
    abortSignal: controller.signal,
  });

  assert.equal(response.content, "ok");
  assert.equal("signal" in calls[0]!.body, false);
  assert.equal(calls[0]!.options?.signal, controller.signal);
});

test("chat completions non-streaming passes abort signal as SDK options", async () => {
  const controller = new AbortController();
  const calls: Array<{ body: Record<string, unknown>; options: Record<string, unknown> | undefined }> = [];
  const client = createClient(async (body, options) => {
    calls.push({ body, options });
    return {
      choices: [{ message: { content: "ok", tool_calls: [] } }],
    };
  });

  const response = await chatCompletionsAdapter.fetchNonStreaming(client, {
    provider: "openai-compatible",
    model: "community/free-model",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
    thinking: "disabled",
    abortSignal: controller.signal,
  });

  assert.equal(response.content, "ok");
  assert.equal("signal" in calls[0]!.body, false);
  assert.equal(calls[0]!.options?.signal, controller.signal);
});

test("chat completions normalizes generic reasoning deltas", async () => {
  const reasoning: string[] = [];
  const response = await chatCompletionsAdapter.fetchStreaming(createClient(async () => [{
    choices: [{
      delta: {
        reasoning: "Inspect the package first.",
      },
    }],
  }]), {
    provider: "openai-compatible",
    model: "community/free-model",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    callbacks: {
      onReasoningDelta: (delta) => reasoning.push(delta),
    },
    forceReasoning: true,
    thinking: "enabled",
  });

  assert.equal(response.reasoningContent, "Inspect the package first.");
  assert.deepEqual(reasoning, ["Inspect the package first."]);
});

test("Gemini streaming captures tool-call provider metadata for replay", async () => {
  const response = await chatCompletionsAdapter.fetchStreaming(createClient(async () => [{
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: "call-google",
          type: "function",
          extra_content: {
            google: { thought_signature: "stream-signature" },
          },
          function: { name: "read", arguments: "{\"path\":\"README.md\"}" },
        }],
      },
    }],
  }]), {
    provider: "google",
    model: "gemini-3.5-flash",
    messages: [{ role: "user", content: "read the project" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
    thinking: "enabled",
  });

  assert.deepEqual(response.toolCalls[0]?.providerMetadata, {
    google: { thought_signature: "stream-signature" },
  });
});

test("Gemini non-streaming captures tool-call provider metadata for replay", async () => {
  const response = await chatCompletionsAdapter.fetchNonStreaming(createClient(async () => ({
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          id: "call-google",
          type: "function",
          extra_content: {
            google: { thought_signature: "response-signature" },
          },
          function: { name: "read", arguments: "{\"path\":\"README.md\"}" },
        }],
      },
    }],
  })), {
    provider: "google",
    model: "gemini-3.5-flash",
    messages: [{ role: "user", content: "read the project" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
    thinking: "enabled",
  });

  assert.deepEqual(response.toolCalls[0]?.providerMetadata, {
    google: { thought_signature: "response-signature" },
  });
});

function createClient(
  create: (body: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>,
) {
  return {
    chat: {
      completions: {
        create,
      },
    },
  } as never;
}
