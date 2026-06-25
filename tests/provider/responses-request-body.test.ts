import assert from "node:assert/strict";
import test from "node:test";

import { buildResponsesRequestBody } from "../../src/provider/responsesAdapter.js";

test("OpenAI responses request respects disabled thinking", () => {
  const body = buildResponsesRequestBody({
    provider: "openai",
    model: "gpt-5.5",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
    thinking: "disabled",
  });

  assert.equal("reasoning" in body, false);
});

test("OpenAI responses request keeps default reasoning when thinking is not disabled", () => {
  const body = buildResponsesRequestBody({
    provider: "openai",
    model: "gpt-5.5",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
  });

  assert.deepEqual(body.reasoning, {
    effort: "high",
    summary: "detailed",
  });
});
