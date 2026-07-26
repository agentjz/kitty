import assert from "node:assert/strict";
import test from "node:test";

import { fetchAssistantResponse } from "../../src/provider/request.js";
import { mapLlm2apiCapabilities } from "../../src/provider/llm2apiModels.js";

test("provider rejection does not replay a streaming request as non-streaming", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    throw Object.assign(new Error("Unsupported parameter"), { status: 400 });
  });

  await assert.rejects(
    () => fetchAssistantResponse(
      client,
      [{ role: "user", content: "hello" }],
      {
        provider: "openai-compatible",
        model: "community/free-model",
      },
      undefined,
      undefined,
    ),
    /Unsupported parameter/,
  );

  assert.equal(calls, 1);
});

test("rate limiting stays inside the streaming retry budget without non-streaming replay", async () => {
  const streams: boolean[] = [];
  const client = createClient(async (body) => {
    streams.push(Boolean(body.stream));
    throw Object.assign(new Error("rate limited"), {
      status: 429,
      headers: {
        "retry-after": "0",
      },
    });
  });

  await assert.rejects(
    () => fetchAssistantResponse(
      client,
      [{ role: "user", content: "hello" }],
      {
        provider: "openai-compatible",
        model: "community/free-model",
      },
      undefined,
      undefined,
    ),
    /rate limited/,
  );

  assert.deepEqual(streams, [true, true, true, true]);
});

test("Zhipu terminal account limits stop before another provider request", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    throw Object.assign(new Error("weekly limit reached"), {
      status: 429,
      code: 1310,
    });
  });

  await assert.rejects(
    () => fetchAssistantResponse(
      client,
      [{ role: "user", content: "hello" }],
      {
        provider: "zhipu",
        model: "glm-4.7-flash",
      },
      undefined,
      undefined,
    ),
    /weekly limit reached/,
  );

  assert.equal(calls, 1);
});

test("stream framing failure may use one non-streaming fallback", async () => {
  const streams: boolean[] = [];
  const client = createClient(async (body) => {
    streams.push(Boolean(body.stream));
    if (body.stream) {
      throw new Error("stream ended unexpectedly");
    }

    return {
      choices: [{ message: { content: "ok", tool_calls: [] } }],
    };
  });

  const response = await fetchAssistantResponse(
    client,
    [{ role: "user", content: "hello" }],
    {
      provider: "openai-compatible",
      model: "community/free-model",
    },
    undefined,
    undefined,
  );

  assert.equal(response.content, "ok");
  assert.deepEqual(streams, [true, false]);
});

test("stream fallback shares the four-call logical request budget", async () => {
  const streams: boolean[] = [];
  const client = createClient(async (body) => {
    streams.push(Boolean(body.stream));
    if (body.stream) {
      throw new Error("stream ended unexpectedly");
    }

    throw Object.assign(new Error("overloaded"), {
      status: 503,
      headers: {
        "retry-after": "0",
      },
    });
  });

  await assert.rejects(
    () => fetchAssistantResponse(
      client,
      [{ role: "user", content: "hello" }],
      {
        provider: "openai-compatible",
        model: "community/free-model",
      },
      undefined,
      undefined,
    ),
    /overloaded/,
  );

  assert.deepEqual(streams, [true, false, false, false]);
});

test("relay models without streaming tools start tool turns as non-streaming", async () => {
  const streams: boolean[] = [];
  const client = createClient(async (body) => {
    streams.push(Boolean(body.stream));
    return {
      choices: [{ message: { content: "", tool_calls: [{
        id: "call-1",
        type: "function",
        function: { name: "read_status", arguments: "{}" },
      }] } }],
    };
  });

  const response = await fetchAssistantResponse(
    client,
    [{ role: "user", content: "read status" }],
    {
      provider: "llm2api",
      model: "agnes-2.0-flash",
      thinking: "enabled",
      capabilities: mapLlm2apiCapabilities("agnes-2.0-flash", {
        streaming: true,
        tools: { function_calling: true, tool_choice: ["auto"], streaming_tool_calls: false },
        reasoning: { enabled: true, configurable: true, default_enabled: true },
        usage: { stream: true },
        limits: { output_tokens: 65_500 },
      }),
    },
    [{
      type: "function",
      function: {
        name: "read_status",
        description: "Read status.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    }],
    undefined,
  );

  assert.equal(response.toolCalls?.[0]?.function.name, "read_status");
  assert.deepEqual(streams, [false]);
});

function createClient(
  create: (body: Record<string, unknown>) => Promise<unknown>,
) {
  return {
    chat: {
      completions: {
        create,
      },
    },
  } as never;
}
