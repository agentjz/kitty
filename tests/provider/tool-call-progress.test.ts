import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallProgress } from "../../src/agent/types.js";
import { chatCompletionsAdapter } from "../../src/provider/chatCompletionsAdapter.js";

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
