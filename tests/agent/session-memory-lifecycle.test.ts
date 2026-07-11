import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { renderPromptLayers } from "../../src/agent/prompt/format.js";
import { runAgentTurn } from "../../src/agent/turn/run.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { buildContextRuntimePromptLayers } from "../../src/context/runtime/prompt.js";
import { buildContextRuntimeRequest } from "../../src/context/runtime/request.js";
import { buildLeadWakeFacts } from "../../src/execution/leadWait.js";
import { InProcessSessionStore } from "../../src/session/store.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import type { AssistantResponse, ModelRequestInput } from "../../src/agent/types.js";
import type { RegisteredTool } from "../../src/tools/core/types.js";

test("agent turn writes same-session memory as a fixed lifecycle behavior", async (t) => {
  const root = await createTempWorkspace("session-memory-lifecycle", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const mainRequests: ModelRequestInput[] = [];
  const memoryRequests: ModelRequestInput[] = [];

  const result = await runAgentTurn({
    input: "请以后用 txt 纯文本回答，并记住现在要比较 luckymaomi/777f 和 luckymaomi/ohmyflight。",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({ onlyNames: [] }),
    fetchAssistantResponse: async (request): Promise<AssistantResponse> => {
      mainRequests.push(request);
      return {
        content: "我会用 txt 纯文本回答，并围绕这两个仓库继续。",
        toolCalls: [],
      };
    },
    fetchSessionTitleResponse: async () => titleResponse("仓库比较要求"),
    fetchSessionMemoryResponse: async (request): Promise<AssistantResponse> => {
      memoryRequests.push(request);
      return {
        content: [
          "## Current Focus",
          "比较 luckymaomi/777f 和 luckymaomi/ohmyflight。",
          "",
          "## User Constraints",
          "用户要求本 session 用 txt 纯文本回答。",
          "",
          "## Decisions",
          "None",
          "",
          "## Open Threads",
          "继续围绕两个仓库对比。",
          "",
          "## Verification Facts",
          "None",
          "",
          "## Reusable Lessons",
          "None",
        ].join("\n"),
        toolCalls: [],
      };
    },
  });

  assert.equal(mainRequests.length, 1);
  assert.equal(memoryRequests.length, 1);
  assert.equal(memoryRequests[0]?.tools.length, 0);
  assert.match(result.session.sessionMemory?.summary ?? "", /## Current Focus/);
  assert.match(result.session.sessionMemory?.summary ?? "", /## User Constraints/);
  assert.match(result.session.sessionMemory?.summary ?? "", /txt 纯文本回答/);
  assert.match(result.session.sessionMemory?.summary ?? "", /luckymaomi\/777f/);
  assert.match(result.session.sessionMemory?.summary ?? "", /luckymaomi\/ohmyflight/);
  const ledger = new ControlPlaneLedger(root);
  const lifecycle = ledger.taskLifecycle.loadCurrent(result.session.id);
  ledger.close();
  assert.equal(lifecycle?.stage, "completed");
  assert.equal(result.session.taskState?.focus, "比较 luckymaomi/777f 和 luckymaomi/ohmyflight。");
});

test("agent turn generates a model-written session title once", async (t) => {
  const root = await createTempWorkspace("session-title-lifecycle", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const titleRequests: ModelRequestInput[] = [];

  const first = await runAgentTurn({
    input: "帮我设计启动时恢复最近会话的体验。",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({ onlyNames: [] }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "可以。入口先列出最近会话，用户选择继续或新建。",
      toolCalls: [],
    }),
    fetchSessionTitleResponse: async (request): Promise<AssistantResponse> => {
      titleRequests.push(request);
      return {
        content: "启动会话选择",
        toolCalls: [],
      };
    },
    fetchSessionMemoryResponse: async (): Promise<AssistantResponse> => ({
      content: [
        "## Current Focus",
        "设计启动时恢复最近会话的体验。",
        "",
        "## User Constraints",
        "None",
        "",
        "## Decisions",
        "None",
        "",
        "## Open Threads",
        "None",
        "",
        "## Verification Facts",
        "None",
        "",
        "## Reusable Lessons",
        "None",
      ].join("\n"),
      toolCalls: [],
    }),
  });

  const second = await runAgentTurn({
    input: "继续。",
    cwd: root,
    config,
    session: first.session,
    sessionStore,
    toolRegistry: createToolRegistry({ onlyNames: [] }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "继续完善边界。",
      toolCalls: [],
    }),
    fetchSessionTitleResponse: async (): Promise<AssistantResponse> => {
      throw new Error("title should already exist");
    },
    fetchSessionMemoryResponse: async (): Promise<AssistantResponse> => ({
      content: [
        "## Current Focus",
        "继续完善启动会话选择。",
        "",
        "## User Constraints",
        "None",
        "",
        "## Decisions",
        "None",
        "",
        "## Open Threads",
        "None",
        "",
        "## Verification Facts",
        "None",
        "",
        "## Reusable Lessons",
        "None",
      ].join("\n"),
      toolCalls: [],
    }),
  });

  assert.equal(titleRequests.length, 1);
  assert.equal(titleRequests[0]?.tools.length, 0);
  assert.equal(first.session.title, "启动会话选择");
  assert.equal(second.session.title, "启动会话选择");
});

test("plain turn input does not become machine-written focus", async (t) => {
  const root = await createTempWorkspace("plain-turn-input-no-focus", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);

  const result = await runAgentTurn({
    input: "你好",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({ onlyNames: [] }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "你好。",
      toolCalls: [],
    }),
    fetchSessionTitleResponse: async () => titleResponse("问候"),
    fetchSessionMemoryResponse: async (): Promise<AssistantResponse> => ({
      content: [
        "## Current Focus",
        "None",
        "",
        "## User Constraints",
        "None",
        "",
        "## Decisions",
        "None",
        "",
        "## Open Threads",
        "None",
        "",
        "## Verification Facts",
        "None",
        "",
        "## Reusable Lessons",
        "None",
      ].join("\n"),
      toolCalls: [],
    }),
  });

  const ledger = new ControlPlaneLedger(root);
  const lifecycle = ledger.taskLifecycle.loadCurrent(result.session.id);
  ledger.close();

  assert.equal(result.session.taskState?.focus, undefined);
  assert.equal(result.session.checkpoint?.focus, undefined);
  assert.equal(lifecycle?.stage, "completed");
});

test("model-written session memory focus becomes working memory focus", async (t) => {
  const root = await createTempWorkspace("session-memory-focus", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);

  const result = await runAgentTurn({
    input: "继续比较两个仓库。",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({ onlyNames: [] }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "继续比较。",
      toolCalls: [],
    }),
    fetchSessionTitleResponse: async () => titleResponse("仓库比较"),
    fetchSessionMemoryResponse: async (): Promise<AssistantResponse> => ({
      content: [
        "## Current Focus",
        "比较 luckymaomi/777f 和 luckymaomi/ohmyflight。",
        "",
        "## User Constraints",
        "None",
        "",
        "## Decisions",
        "None",
        "",
        "## Open Threads",
        "None",
        "",
        "## Verification Facts",
        "None",
        "",
        "## Reusable Lessons",
        "None",
      ].join("\n"),
      toolCalls: [],
    }),
  });

  assert.equal(result.session.taskState?.focus, "比较 luckymaomi/777f 和 luckymaomi/ohmyflight。");
});

test("next turn injects model-written session memory while raw provider messages keep visible conversation", async (t) => {
  const root = await createTempWorkspace("session-memory-prompt", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    messages: [
      {
        role: "user",
        content: "请以后用 txt 纯文本回答，并比较 luckymaomi/777f 和 luckymaomi/ohmyflight。",
        createdAt: "2026-05-21T20:00:00.000Z",
      },
      {
        role: "assistant",
        content: "我会按这个方向继续。",
        createdAt: "2026-05-21T20:00:01.000Z",
      },
      {
        role: "user",
        content: "你还记得刚刚的要求吗？",
        createdAt: "2026-05-21T20:01:00.000Z",
      },
    ],
    sessionMemory: {
      version: 1,
      summary: [
        "## Current Focus",
        "比较 luckymaomi/777f 和 luckymaomi/ohmyflight。",
        "",
        "## User Constraints",
        "用户要求本 session 用 txt 纯文本回答。",
        "",
        "## Decisions",
        "None",
        "",
        "## Open Threads",
        "None",
        "",
        "## Verification Facts",
        "None",
        "",
        "## Reusable Lessons",
        "None",
      ].join("\n"),
      updatedAt: "2026-05-21T20:00:02.000Z",
    },
  });

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
    messages: session.messages,
    sessionMemory: session.sessionMemory,
  });
  const request = buildContextRuntimeRequest({
    prompt: promptLayers,
    session,
    config,
  });
  const prompt = renderPromptLayers(promptLayers);
  const rawMessages = request.messages.slice(1).map((message) => String(message.content ?? "")).join("\n");

  assert.match(prompt, /txt 纯文本回答/);
  assert.match(prompt, /luckymaomi\/777f/);
  assert.match(prompt, /luckymaomi\/ohmyflight/);
  assert.match(rawMessages, /请以后用 txt 纯文本回答/);
  assert.match(rawMessages, /我会按这个方向继续/);
  assert.match(rawMessages, /你还记得刚刚的要求吗/);
});

test("session memory lifecycle receives tool evidence and session diff facts", async (t) => {
  const root = await createTempWorkspace("session-memory-tool-evidence", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const memoryRequests: ModelRequestInput[] = [];
  let mainRequestCount = 0;

  const result = await runAgentTurn({
    input: "写一个状态文件，然后告诉我结果。",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({
      onlyNames: ["write_status"],
      sources: [{
        kind: "host",
        id: "test:lifecycle",
        tools: [createWriteStatusTool(root)],
      }],
    }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => {
      mainRequestCount += 1;
      if (mainRequestCount === 1) {
        return {
          content: "我会写入状态文件。",
          toolCalls: [{
            id: "tool-1",
            type: "function",
            function: {
              name: "write_status",
              arguments: "{}",
            },
          }],
        };
      }

      return {
        content: "状态文件已经写入。",
        toolCalls: [],
      };
    },
    fetchSessionTitleResponse: async () => titleResponse("状态文件写入"),
    fetchSessionMemoryResponse: async (request): Promise<AssistantResponse> => {
      memoryRequests.push(request);
      return {
        content: [
          "## Current Focus",
          "写入状态文件并告知结果。",
          "",
          "## User Constraints",
          "None",
          "",
          "## Decisions",
          "None",
          "",
          "## Open Threads",
          "None",
          "",
          "## Verification Facts",
          "write_status 写入了 status.txt；assistant 确认状态文件已经写入。",
          "",
          "## Reusable Lessons",
          "None",
        ].join("\n"),
        toolCalls: [],
      };
    },
  });

  const memoryFacts = String(memoryRequests[0]?.messages[1]?.content ?? "");
  assert.equal(result.session.sessionMemory?.summary.includes("status.txt"), true);
  assert.match(memoryFacts, /Tool activity:\nwrite_status/);
  assert.match(memoryFacts, /Tool evidence:\n- write_status:/);
  assert.match(memoryFacts, /status\.txt/);
  assert.match(memoryFacts, /Session diff facts:/);
  assert.match(memoryFacts, /changedPaths=status\.txt/);
  assert.match(memoryFacts, /Checkpoint facts:/);
  assert.match(memoryFacts, /recentToolBatch=.*write_status/);
});

test("previous session memory is passed to the model for structured rewrite", async (t) => {
  const root = await createTempWorkspace("session-memory-structured-rewrite", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    sessionMemory: {
      version: 1,
      summary: "用户要求用 txt 回答；当前任务是整理 memory。",
      updatedAt: "2026-05-22T00:00:00.000Z",
    },
  });
  const memoryRequests: ModelRequestInput[] = [];

  const result = await runAgentTurn({
    input: "继续整理 memory。",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({ onlyNames: [] }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "继续整理 memory。",
      toolCalls: [],
    }),
    fetchSessionTitleResponse: async () => titleResponse("整理记忆"),
    fetchSessionMemoryResponse: async (request): Promise<AssistantResponse> => {
      memoryRequests.push(request);
      return {
        content: [
          "## Current Focus",
          "继续整理 memory。",
          "",
          "## User Constraints",
          "用户要求用 txt 回答。",
          "",
          "## Decisions",
          "None",
          "",
          "## Open Threads",
          "None",
          "",
          "## Verification Facts",
          "None",
          "",
          "## Reusable Lessons",
          "None",
        ].join("\n"),
        toolCalls: [],
      };
    },
  });

  const requestFacts = String(memoryRequests[0]?.messages[1]?.content ?? "");
  assert.match(requestFacts, /用户要求用 txt 回答/);
  assert.match(result.session.sessionMemory?.summary ?? "", /## Current Focus/);
  assert.match(result.session.sessionMemory?.summary ?? "", /## User Constraints/);
});

test("session memory lifecycle records failed memory updates without failing the turn", async (t) => {
  const root = await createTempWorkspace("session-memory-failure", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);

  const result = await runAgentTurn({
    input: "正常回答即可。",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({ onlyNames: [] }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "这是正常回答。",
      toolCalls: [],
    }),
    fetchSessionTitleResponse: async () => titleResponse("正常回答"),
    fetchSessionMemoryResponse: async (): Promise<AssistantResponse> => {
      throw new Error("memory model unavailable");
    },
  });

  assert.equal(result.session.sessionMemory, undefined);
  const events = await readObservabilityEvents(root);
  assert.equal(events.some((event) =>
    event.event === "agent.session_memory" &&
    event.status === "failed" &&
    event.error?.message === "memory model unavailable"
  ), true);
});

test("internal wake turns do not rewrite same-session memory as user intent", async (t) => {
  const root = await createTempWorkspace("session-memory-internal-wake", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  let memoryRequestCount = 0;

  const result = await runAgentTurn({
    input: buildLeadWakeFacts([{
      id: "exec-1",
      kind: "subagent",
      status: "completed",
      cwd: root,
      requestedBy: "lead",
      actorName: "worker",
      summary: "done",
      changedPaths: [],
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:01.000Z",
    }]).userInput,
    cwd: root,
    config,
    session,
    sessionStore,
    inputSource: "internal",
    toolRegistry: createToolRegistry({ onlyNames: [] }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "继续当前工作。",
      toolCalls: [],
    }),
    fetchSessionTitleResponse: async () => titleResponse("内部唤醒"),
    fetchSessionMemoryResponse: async (): Promise<AssistantResponse> => {
      memoryRequestCount += 1;
      return {
        content: "should not be written",
        toolCalls: [],
      };
    },
  });

  assert.equal(memoryRequestCount, 0);
  assert.equal(result.session.sessionMemory, undefined);
  assert.equal(result.session.title, undefined);
});

function createWriteStatusTool(root: string): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name: "write_status",
        description: "Write a test status file.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    async execute() {
      await fs.writeFile(path.join(root, "status.txt"), "ready\n", "utf8");
      return {
        ok: true,
        output: JSON.stringify({ ok: true, path: "status.txt" }, null, 2),
        metadata: {
          changedPaths: ["status.txt"],
          sessionDiff: {
            toolName: "write_status",
            changedPaths: ["status.txt"],
            diagnosticsStatus: "clean",
            errorCount: 0,
            warningCount: 0,
            recordedAt: "2026-05-22T00:00:00.000Z",
          },
        },
      };
    },
  };
}

function titleResponse(content: string): AssistantResponse {
  return {
    content,
    toolCalls: [],
  };
}

async function readObservabilityEvents(root: string): Promise<Array<{
  event: string;
  status: string;
  error?: { message?: string };
}>> {
  const dir = path.join(root, ".kitty", "observability", "events");
  const entries = await fs.readdir(dir).catch(() => []);
  const events = await Promise.all(entries.map(async (entry) => {
    const raw = await fs.readFile(path.join(dir, entry), "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event: string; status: string; error?: { message?: string } });
  }));
  return events.flat();
}
