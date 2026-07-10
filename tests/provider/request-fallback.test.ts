import assert from "node:assert/strict";
import test from "node:test";

import { fetchAssistantResponse } from "../../src/provider/request.js";

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
        provider: "nvidia",
        model: "deepseek-ai/deepseek-v4-flash",
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
        provider: "nvidia",
        model: "deepseek-ai/deepseek-v4-flash",
      },
      undefined,
      undefined,
    ),
    /rate limited/,
  );

  assert.deepEqual(streams, [true, true, true, true]);
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
      provider: "nvidia",
      model: "deepseek-ai/deepseek-v4-flash",
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
        provider: "nvidia",
        model: "deepseek-ai/deepseek-v4-flash",
      },
      undefined,
      undefined,
    ),
    /overloaded/,
  );

  assert.deepEqual(streams, [true, false, false, false]);
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
