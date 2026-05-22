import assert from "node:assert/strict";
import test from "node:test";

import { buildContextRuntimePromptLayers } from "../../src/context/runtime/prompt.js";
import { buildCompressedContextRequest } from "../../src/context/runtime/compression/builder.js";
import { renderPromptLayers } from "../../src/agent/prompt/format.js";
import { createTestRuntimeConfig } from "../helpers.js";
import type { StoredMessage } from "../../src/types.js";

test("context compression keeps full current turn while under budget", () => {
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: "show capabilities",
      createdAt: "2026-05-20T00:00:00.000Z",
    },
    ...Array.from({ length: 40 }, (_, index): StoredMessage => ({
      role: index % 2 === 0 ? "assistant" : "tool",
      name: index % 2 === 0 ? undefined : "read",
      content: `message ${index} ${"x".repeat(100)}`,
      createdAt: `2026-05-20T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
    })),
  ];

  const request = buildCompressedContextRequest(
    "system prompt",
    messages,
    {
      contextWindowMessages: 6,
      model: "deepseek-v4-flash",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );

  assert.equal(request.compressed, false);
  assert.equal(request.summary, undefined);
  assert.equal(request.messages.length, 1 + messages.length);
});

test("context request keeps raw messages scoped to the current user frame", () => {
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: "请以后不要 Markdown，用 txt 格式。",
      createdAt: "2026-05-21T19:56:00.000Z",
    },
    {
      role: "assistant",
      content: "我会用 txt 纯文本格式回答。",
      createdAt: "2026-05-21T19:56:03.000Z",
    },
    {
      role: "user",
      content: "你还记得刚刚让我做什么吗？",
      createdAt: "2026-05-21T20:00:00.000Z",
    },
  ];

  const request = buildCompressedContextRequest(
    "system prompt",
    messages,
    {
      contextWindowMessages: 120,
      model: "deepseek-v4-flash",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );
  const rawMessages = request.messages.slice(1).map((message) => String(message.content ?? "")).join("\n");

  assert.equal(request.compressed, false);
  assert.equal(request.messages.length, 2);
  assert.equal(rawMessages, "你还记得刚刚让我做什么吗？");
});

test("runtime prompt carries same-session memory while raw request stays on current frame", () => {
  const root = process.cwd();
  const config = createTestRuntimeConfig(root);
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: "请以后不要 Markdown，用 txt 格式。",
      createdAt: "2026-05-21T19:56:00.000Z",
    },
    {
      role: "assistant",
      content: "我会用 txt 纯文本格式回答。",
      createdAt: "2026-05-21T19:56:03.000Z",
    },
    {
      role: "user",
      content: "https://github.com/agentjz/777f 和 https://github.com/agentjz/ohmyflight，请把这两个项目 clone 到桌面，也对比这两个项目。",
      createdAt: "2026-05-21T19:56:10.000Z",
    },
    {
      role: "user",
      content: "你还记得刚刚让我做什么吗？",
      createdAt: "2026-05-21T20:00:00.000Z",
    },
  ];
  const promptLayers = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext: {
      rootDir: root,
      stateRootDir: root,
      cwd: root,
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
    },
    messages,
  });
  const prompt = renderPromptLayers(promptLayers);
  const request = buildCompressedContextRequest(
    promptLayers,
    messages,
    {
      contextWindowMessages: 120,
      model: "deepseek-v4-flash",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );
  const rawMessages = request.messages.slice(1).map((message) => String(message.content ?? "")).join("\n");

  assert.match(prompt, /Current session conversation brief/);
  assert.match(prompt, /不要 Markdown，用 txt 格式/);
  assert.match(prompt, /agentjz\/777f/);
  assert.match(prompt, /agentjz\/ohmyflight/);
  assert.equal(rawMessages, "你还记得刚刚让我做什么吗？");
});
