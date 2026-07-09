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

test("context request keeps visible near-field conversation under budget", () => {
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
  assert.equal(request.messages.length, 4);
  assert.match(rawMessages, /请以后不要 Markdown，用 txt 格式/);
  assert.match(rawMessages, /我会用 txt 纯文本格式回答/);
  assert.match(rawMessages, /你还记得刚刚让我做什么吗/);
  assert.equal(request.budget.sources.some((source) => source.name === "nearFieldConversation" && source.messages === 3), true);
});

test("runtime prompt carries same-session memory while raw request keeps near-field conversation", () => {
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
      content: "https://github.com/luckymaomi/777f 和 https://github.com/luckymaomi/ohmyflight，请把这两个项目 clone 到桌面，也对比这两个项目。",
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
      "用户要求以后不要 Markdown，用 txt 格式。当前任务是 clone 并对比 luckymaomi/777f 和 luckymaomi/ohmyflight。",
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

  assert.match(prompt, /Conversation continuity evidence/);
  assert.match(prompt, /不要 Markdown，用 txt 格式/);
  assert.match(prompt, /luckymaomi\/777f/);
  assert.match(prompt, /luckymaomi\/ohmyflight/);
  assert.doesNotMatch(prompt, /我会用 txt 纯文本格式回答/);
  assert.match(rawMessages, /请以后不要 Markdown，用 txt 格式/);
  assert.match(rawMessages, /我会用 txt 纯文本格式回答/);
  assert.match(rawMessages, /luckymaomi\/777f/);
  assert.match(rawMessages, /你还记得刚刚让我做什么吗/);
});

test("internal source wake turn is excluded while literal internal-looking user text stays visible", () => {
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: "先聊 DeepSeek。",
      createdAt: "2026-05-21T19:56:00.000Z",
    },
    {
      role: "assistant",
      content: "可以，先聊 DeepSeek。",
      createdAt: "2026-05-21T19:56:03.000Z",
    },
    {
      role: "user",
      content: "[internal] wake: subagent completed",
      source: "internal",
      createdAt: "2026-05-21T19:57:00.000Z",
    },
    {
      role: "assistant",
      content: "内部唤醒处理完成。",
      createdAt: "2026-05-21T19:57:01.000Z",
    },
    {
      role: "user",
      content: "[internal] 这是用户真实输入，必须可见。",
      createdAt: "2026-05-21T19:58:00.000Z",
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

  assert.match(rawMessages, /先聊 DeepSeek/);
  assert.match(rawMessages, /这是用户真实输入，必须可见/);
  assert.doesNotMatch(rawMessages, /subagent completed/);
  assert.doesNotMatch(rawMessages, /内部唤醒处理完成/);
});

test("context cache layout keeps stable prefix fingerprint separate from volatile tail", () => {
  const first = buildCompressedContextRequest(
    "system prompt",
    [
      {
        role: "user",
        content: "first turn",
        createdAt: "2026-05-20T00:00:00.000Z",
      },
    ],
    {
      contextWindowMessages: 120,
      model: "deepseek-v4-flash",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );
  const second = buildCompressedContextRequest(
    "system prompt",
    [
      {
        role: "user",
        content: "first turn",
        createdAt: "2026-05-20T00:00:00.000Z",
      },
      {
        role: "user",
        content: "second turn",
        createdAt: "2026-05-20T00:01:00.000Z",
      },
    ],
    {
      contextWindowMessages: 120,
      model: "deepseek-v4-flash",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );

  assert.equal(first.cacheLayout?.stablePrefixFingerprint, second.cacheLayout?.stablePrefixFingerprint);
  assert.notEqual(first.cacheLayout?.volatileTailFingerprint, second.cacheLayout?.volatileTailFingerprint);
});

test("runtime prompt cache stable prefix ignores volatile runtime facts", () => {
  const root = process.cwd();
  const config = createTestRuntimeConfig(root);
  const baseProjectContext = {
    rootDir: root,
    stateRootDir: root,
    cwd: root,
    instructions: [],
    instructionText: "",
    instructionTruncated: false,
    ignoreRules: [],
    skills: [],
  };
  const firstPrompt = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext: {
      ...baseProjectContext,
      projectMap: {
        rootDir: root,
        cwd: root,
        topLevelDirectories: ["src"],
        entryFiles: ["src/cli.ts"],
        testDirectories: ["tests"],
        packageScripts: ["test"],
        specDocuments: ["spec.md"],
        git: {
          available: true,
          hasChanges: false,
          recentChanges: [],
        },
        summary: "Runtime prompt cache fixture.",
        updatedAt: "2026-06-16T00:00:00.000Z",
      },
    },
    taskLifecycle: {
      id: "task-1",
      sessionId: "session-1",
      stage: "normal_work",
      reason: "first",
      activeExecutionIds: [],
      activeTodoIds: [],
      verificationFacts: [],
      completionFacts: [],
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:00.000Z",
    },
  });
  const secondPrompt = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext: {
      ...baseProjectContext,
      projectMap: {
        rootDir: root,
        cwd: root,
        topLevelDirectories: ["src"],
        entryFiles: ["src/cli.ts"],
        testDirectories: ["tests"],
        packageScripts: ["test"],
        specDocuments: ["spec.md"],
        git: {
          available: true,
          hasChanges: true,
          recentChanges: ["M src/context/runtime/compression/builder.ts"],
        },
        summary: "Runtime prompt cache fixture.",
        updatedAt: "2026-06-16T00:01:00.000Z",
      },
    },
    taskLifecycle: {
      id: "task-1",
      sessionId: "session-1",
      stage: "normal_work",
      reason: "second",
      activeExecutionIds: ["exec-1"],
      activeTodoIds: [],
      verificationFacts: ["one check passed"],
      completionFacts: [],
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:01:00.000Z",
    },
  });
  const first = buildCompressedContextRequest(firstPrompt, [], {
    contextWindowMessages: 120,
    model: "deepseek-v4-flash",
    maxContextChars: 900_000,
    contextSummaryChars: 120_000,
  });
  const second = buildCompressedContextRequest(secondPrompt, [], {
    contextWindowMessages: 120,
    model: "deepseek-v4-flash",
    maxContextChars: 900_000,
    contextSummaryChars: 120_000,
  });

  assert.equal(first.cacheLayout?.stablePrefixFingerprint, second.cacheLayout?.stablePrefixFingerprint);
  assert.notEqual(first.cacheLayout?.volatileTailFingerprint, second.cacheLayout?.volatileTailFingerprint);
  assert.deepEqual(first.cacheLayout?.stableSources, ["staticPrompt", "profilePersona"]);
  assert.deepEqual(first.cacheLayout?.volatileSources, ["runtimeFacts", "nearFieldConversation"]);
});

test("runtime prompt skill index does not inject skill body or resources by default", () => {
  const root = process.cwd();
  const config = createTestRuntimeConfig(root);
  const promptLayers = buildContextRuntimePromptLayers({
    cwd: root,
    config: {
      ...config,
      extensions: {
        ...config.extensions,
        skills: true,
      },
    },
    projectContext: {
      rootDir: root,
      stateRootDir: root,
      cwd: root,
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
      skills: [{
        name: "expensive-method",
        description: "Use this only when needed.",
        path: "skills/expensive-method/SKILL.md",
        absolutePath: `${root}/skills/expensive-method/SKILL.md`,
        body: "FULL_SKILL_BODY_SHOULD_NOT_BE_IN_DEFAULT_PROMPT",
        dependencies: [],
        resources: [{
          path: "references/large.md",
          size: 120_000,
          kind: "references",
        }],
        health: {
          status: "ready",
          bodyPresent: true,
          resourceCount: 1,
          dependencyCount: 0,
          resourceGroups: {
            references: 1,
            scripts: 0,
            examples: 0,
            assets: 0,
            other: 0,
          },
          issues: [],
        },
      }],
    },
  });
  const prompt = renderPromptLayers(promptLayers);

  assert.match(prompt, /Available skills/);
  assert.match(prompt, /expensive-method/);
  assert.match(prompt, /resources=1/);
  assert.doesNotMatch(prompt, /FULL_SKILL_BODY_SHOULD_NOT_BE_IN_DEFAULT_PROMPT/);
  assert.doesNotMatch(prompt, /references\/large\.md/);
});

test("large old tool output is compacted without changing the stable prefix", () => {
  const promptLayers = {
    staticBlocks: ["Static contract"],
    profilePersonaBlocks: ["Profile contract"],
    runtimeFactBlocks: ["Runtime facts one"],
  };
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: "run test",
      createdAt: "2026-06-17T00:00:00.000Z",
    },
    {
      role: "assistant",
      content: "I will run the test.",
      createdAt: "2026-06-17T00:00:01.000Z",
    },
    {
      role: "tool",
      name: "bash",
      content: `huge output ${"x".repeat(20_000)}`,
      createdAt: "2026-06-17T00:00:02.000Z",
    },
    {
      role: "user",
      content: "continue",
      createdAt: "2026-06-17T00:00:03.000Z",
    },
  ];
  const first = buildCompressedContextRequest(promptLayers, messages, {
    contextWindowMessages: 4,
    model: "deepseek-v4-flash",
    maxContextChars: 3_000,
    contextSummaryChars: 500,
  });
  const second = buildCompressedContextRequest({
    ...promptLayers,
    runtimeFactBlocks: ["Runtime facts two with changed execution state"],
  }, [
    ...messages,
    {
      role: "user",
      content: "next",
      createdAt: "2026-06-17T00:00:04.000Z",
    },
  ], {
    contextWindowMessages: 5,
    model: "deepseek-v4-flash",
    maxContextChars: 3_000,
    contextSummaryChars: 500,
  });

  assert.equal(first.compressed, true);
  assert.equal(second.compressed, true);
  assert.equal(first.cacheLayout?.stablePrefixFingerprint, second.cacheLayout?.stablePrefixFingerprint);
  assert.notEqual(first.cacheLayout?.volatileTailFingerprint, second.cacheLayout?.volatileTailFingerprint);
  assert.ok((first.cacheLayout?.volatileTailChars ?? 0) < 20_000);
});
