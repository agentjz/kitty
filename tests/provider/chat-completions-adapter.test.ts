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
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-flash",
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
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-flash",
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
    provider: "groq",
    model: "openai/gpt-oss-120b",
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
