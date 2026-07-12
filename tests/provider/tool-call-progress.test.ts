import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallProgress } from "../../src/agent/types.js";
import { chatCompletionsAdapter } from "../../src/provider/chatCompletionsAdapter.js";
import { responsesAdapter } from "../../src/provider/responsesAdapter.js";

test("chat completions reports monotonic tool argument progress and an exact final value", async () => {
  const progress: ToolCallProgress[] = [];
  const argumentChunks = ["{\"path\":\"file.ts\",\"content\":\"", "x".repeat(300), "\"}"];
  const response = await chatCompletionsAdapter.fetchStreaming(createChatClient([
    chatChunk("call-write", "write", argumentChunks[0]!),
    chatChunk(undefined, undefined, argumentChunks[1]!),
    chatChunk(undefined, undefined, argumentChunks[2]!),
  ]), {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "write file" }],
    tools: undefined,
    callbacks: { onToolCallProgress: (fact) => progress.push(fact) },
    forceReasoning: false,
  });

  const expectedArguments = argumentChunks.join("");
  assert.equal(response.toolCalls[0]?.function.arguments, expectedArguments);
  assert.equal(progress[0]?.name, "write");
  assert.equal(progress.at(-1)?.argumentBytesReceived, Buffer.byteLength(expectedArguments, "utf8"));
  assert.equal(progress.length, 3);
  assert.equal(progress.every((fact, index) => index === 0 || fact.argumentBytesReceived > progress[index - 1]!.argumentBytesReceived), true);
});

test("responses streaming learns the tool identity before deltas and reports exact final progress", async () => {
  const progress: ToolCallProgress[] = [];
  const fullArguments = JSON.stringify({ path: "file.ts", old_text: "before", new_text: "after" });
  const splitAt = 20;
  const response = await responsesAdapter.fetchStreaming(createResponsesClient([
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { id: "item-edit", call_id: "call-edit", type: "function_call", name: "edit", arguments: "" },
    },
    { type: "response.function_call_arguments.delta", output_index: 0, item_id: "item-edit", delta: fullArguments.slice(0, splitAt) },
    { type: "response.function_call_arguments.delta", output_index: 0, item_id: "item-edit", delta: fullArguments.slice(splitAt) },
    {
      type: "response.function_call_arguments.done",
      output_index: 0,
      item_id: "item-edit",
      name: "edit",
      arguments: fullArguments,
    },
  ]), {
    provider: "openai",
    model: "gpt-5.5",
    messages: [{ role: "user", content: "edit file" }],
    tools: undefined,
    callbacks: { onToolCallProgress: (fact) => progress.push(fact) },
    forceReasoning: false,
  });

  assert.equal(response.toolCalls[0]?.function.name, "edit");
  assert.equal(response.toolCalls[0]?.function.arguments, fullArguments);
  assert.equal(progress[0]?.argumentBytesReceived, Buffer.byteLength(fullArguments.slice(0, splitAt), "utf8"));
  assert.equal(progress.at(-1)?.argumentBytesReceived, Buffer.byteLength(fullArguments, "utf8"));
  assert.equal(progress.every((fact) => fact.id === "call-edit" && fact.name === "edit"), true);
});

function chatChunk(id: string | undefined, name: string | undefined, argumentsDelta: string): unknown {
  return {
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id,
          function: { name, arguments: argumentsDelta },
        }],
      },
    }],
  };
}

function createChatClient(chunks: unknown[]) {
  return {
    chat: {
      completions: {
        create: async () => chunks,
      },
    },
  } as never;
}

function createResponsesClient(events: unknown[]) {
  return {
    responses: {
      create: async () => events,
    },
  } as never;
}
