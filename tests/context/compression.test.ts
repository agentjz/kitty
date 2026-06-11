import assert from "node:assert/strict";
import test from "node:test";

import { buildContextRuntimePromptLayers } from "../../src/context/runtime/prompt.js";
import { buildCompressedContextRequest } from "../../src/context/runtime/compression/builder.js";
import { renderPromptLayers } from "../../src/agent/prompt/format.js";
import { createTestRuntimeConfig } from "../helpers.js";
import { createSessionMemoryState } from "../../src/session/memory.js";
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
  assert.equal(request.budget.compressed, false);
  assert.equal(request.budget.limitChars, 900_000);
  assert.equal(request.budget.compressionReason, "within_budget");
  assert.ok(request.budget.remainingChars > 0);
  assert.equal(request.budget.promptHotspots[0]?.title, "static_1");
});

test("context compression exposes budget facts when the request is compacted", () => {
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: `start ${"u".repeat(600)}`,
      createdAt: "2026-05-20T00:00:00.000Z",
    },
    ...Array.from({ length: 20 }, (_, index): StoredMessage => ({
      role: index % 2 === 0 ? "assistant" : "tool",
      name: index % 2 === 0 ? undefined : "read",
      content: `message ${index} ${"x".repeat(800)}`,
      createdAt: `2026-05-20T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
    })),
  ];

  const request = buildCompressedContextRequest(
    {
      staticBlocks: [`static ${"s".repeat(3_000)}`],
      profilePersonaBlocks: ["profile"],
      runtimeFactBlocks: ["runtime"],
    },
    messages,
    {
      contextWindowMessages: 10,
      model: "deepseek-v4-flash",
      maxContextChars: 8_000,
      contextSummaryChars: 1_200,
    },
  );

  assert.equal(request.compressed, true);
  assert.equal(request.budget.compressed, true);
  assert.equal(request.budget.limitChars, 8_000);
  assert.ok(request.budget.estimatedChars > 0);
  assert.ok(request.budget.usageRatio > 0);
  assert.match(request.budget.compressionReason, /compaction/);
  assert.equal(request.budget.promptHotspots.some((hotspot) => hotspot.layer === "static"), true);
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
      skills: [],
    },
    messages,
    sessionMemory: createSessionMemoryState(
      "用户要求以后不要 Markdown，用 txt 格式。当前任务是 clone 并对比 agentjz/777f 和 agentjz/ohmyflight。",
      "2026-05-21T20:00:00.000Z",
    ),
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

  assert.match(prompt, /Internal continuity state/);
  assert.match(prompt, /不要 Markdown，用 txt 格式/);
  assert.match(prompt, /agentjz\/777f/);
  assert.match(prompt, /agentjz\/ohmyflight/);
  assert.doesNotMatch(prompt, /我会用 txt 纯文本格式回答/);
  assert.equal(rawMessages, "你还记得刚刚让我做什么吗？");
});
