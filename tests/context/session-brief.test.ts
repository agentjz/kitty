import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionConversationBrief,
  buildSessionConversationBriefBlock,
} from "../../src/context/runtime/sessionBrief/build.js";
import { createSessionMemoryState } from "../../src/session/memory.js";
import type { StoredMessage } from "../../src/types.js";

test("session brief preserves user continuity without exposing a transcript surface", () => {
  const messages: StoredMessage[] = [
    {
      role: "assistant",
      content: "最简单的 Node.js 原生方案是 Eleventy (11ty)，用 npx @11ty/eleventy --serve 本地预览。",
      createdAt: "2026-05-21T10:00:00.000Z",
    },
    {
      role: "user",
      content: "OK",
      createdAt: "2026-05-21T10:00:03.000Z",
    },
    {
      role: "user",
      content: "那继续。",
      createdAt: "2026-05-21T10:00:05.000Z",
    },
  ];

  const block = buildSessionConversationBriefBlock(buildSessionConversationBrief({
    messages,
    timestamp: "2026-05-21T10:00:04.000Z",
  }));

  assert.doesNotMatch(block ?? "", /Confirmed facts/);
  assert.doesNotMatch(block ?? "", /Decisions/);
  assert.doesNotMatch(block ?? "", /Open questions/);
  assert.doesNotMatch(block ?? "", /Next signals/);
  assert.doesNotMatch(block ?? "", /Current session conversation brief/);
  assert.doesNotMatch(block ?? "", /Recent turns/);
  assert.doesNotMatch(block ?? "", /assistant: 最简单的 Node\.js 原生方案是 Eleventy/);
  assert.match(block ?? "", /Recent user inputs: OK | 那继续。/);
});

test("session brief keeps same-session continuity without turning old turns into raw history", () => {
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: "请你以后不要再用markdown格式回答我了，而是用txt格式回答我。",
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
      role: "assistant",
      content: "我会把两个仓库 clone 到桌面，然后对比它们的技术栈、目录结构、测试和维护状态。",
      createdAt: "2026-05-21T19:56:13.000Z",
      tool_calls: [
        {
          id: "tool-1",
          type: "function",
          function: {
            name: "bash",
            arguments: "{\"command\":\"git clone https://github.com/agentjz/777f\"}",
          },
        },
      ],
    },
    {
      role: "tool",
      name: "bash",
      tool_call_id: "tool-1",
      content: "cloned",
      createdAt: "2026-05-21T19:56:20.000Z",
    },
    {
      role: "user",
      content: "你还记得刚刚让我做什么吗？",
      createdAt: "2026-05-21T20:00:00.000Z",
    },
  ];

  const block = buildSessionConversationBriefBlock(buildSessionConversationBrief({
    messages,
    timestamp: "2026-05-21T20:00:01.000Z",
  }));

  assert.match(block ?? "", /不要再用markdown格式回答我/);
  assert.match(block ?? "", /txt格式/);
  assert.match(block ?? "", /agentjz\/777f/);
  assert.match(block ?? "", /agentjz\/ohmyflight/);
  assert.match(block ?? "", /clone 到桌面/);
  assert.match(block ?? "", /对比这两个项目/);
  assert.match(block ?? "", /tools: bash/);
  assert.doesNotMatch(block ?? "", /我会把两个仓库 clone 到桌面/);
});

test("session brief keeps head and tail excerpts for long visible turns", () => {
  const longText = [
    "请记住这个关键任务：比较 https://github.com/agentjz/777f 和 https://github.com/agentjz/ohmyflight。",
    "中间有很多解释文字。",
    "x".repeat(1_200),
    "最终要求：输出 txt，不要 markdown。",
  ].join(" ");

  const block = buildSessionConversationBriefBlock(buildSessionConversationBrief({
    messages: [
      {
        role: "user",
        content: longText,
        createdAt: "2026-05-21T19:56:00.000Z",
      },
      {
        role: "assistant",
        content: "收到。",
        createdAt: "2026-05-21T19:56:03.000Z",
      },
      {
        role: "user",
        content: "你还记得关键任务吗？",
        createdAt: "2026-05-21T19:56:10.000Z",
      },
    ],
    timestamp: "2026-05-21T19:56:04.000Z",
  }));

  assert.match(block ?? "", /agentjz\/777f/);
  assert.match(block ?? "", /agentjz\/ohmyflight/);
  assert.match(block ?? "", /输出 txt/);
  assert.match(block ?? "", /不要 markdown/);
  assert.doesNotMatch(block ?? "", /Omitted long turns.*1/);
});

test("session brief keeps older anchors outside the recent turn window", () => {
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: "请以后不要 Markdown，用 txt 格式。",
      createdAt: "2026-05-21T19:56:00.000Z",
    },
    {
      role: "user",
      content: "比较 https://github.com/agentjz/777f 和 https://github.com/agentjz/ohmyflight。",
      createdAt: "2026-05-21T19:56:10.000Z",
    },
    ...Array.from({ length: 20 }, (_, index): StoredMessage => ({
      role: index % 2 === 0 ? "assistant" : "user",
      content: `普通推进轮次 ${index}`,
      createdAt: `2026-05-21T19:57:${String(index).padStart(2, "0")}.000Z`,
    })),
    {
      role: "user",
      content: "你还记得前面的格式要求和仓库任务吗？",
      createdAt: "2026-05-21T20:00:00.000Z",
    },
  ];

  const block = buildSessionConversationBriefBlock(buildSessionConversationBrief({
    messages,
    timestamp: "2026-05-21T20:00:01.000Z",
  }));

  assert.match(block ?? "", /User anchors/);
  assert.match(block ?? "", /不要 Markdown，用 txt 格式/);
  assert.match(block ?? "", /agentjz\/777f/);
  assert.match(block ?? "", /agentjz\/ohmyflight/);
  assert.match(block ?? "", /你还记得前面的格式要求和仓库任务吗/);
});

test("session brief injects model-written session memory without machine semantic compression", () => {
  const block = buildSessionConversationBriefBlock(buildSessionConversationBrief({
    sessionMemory: createSessionMemoryState(
      "用户要求本 session 用 txt 纯文本回答；当前正在比较 agentjz/777f 和 agentjz/ohmyflight。",
      "2026-05-21T20:00:00.000Z",
    ),
    messages: [
      {
        role: "user",
        content: "你还记得我们刚刚说了什么吗？",
        createdAt: "2026-05-21T20:01:00.000Z",
      },
    ],
    timestamp: "2026-05-21T20:01:01.000Z",
  }));

  assert.match(block ?? "", /Session memory/);
  assert.match(block ?? "", /用户要求本 session 用 txt 纯文本回答/);
  assert.match(block ?? "", /agentjz\/777f/);
  assert.match(block ?? "", /Memory updated at: 2026-05-21T20:00:00\.000Z/);
});
