import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { renderPromptLayers } from "../../src/agent/prompt/format.js";
import { runAgentTurn } from "../../src/agent/turn/run.js";
import { buildContextRuntimePromptLayers } from "../../src/context/runtime/prompt.js";
import { buildContextRuntimeRequest } from "../../src/context/runtime/request.js";
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
    input: "请以后用 txt 纯文本回答，并记住现在要比较 agentjz/777f 和 agentjz/ohmyflight。",
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
    fetchSessionMemoryResponse: async (request): Promise<AssistantResponse> => {
      memoryRequests.push(request);
      return {
        content: "用户要求本 session 用 txt 纯文本回答；当前任务是比较 agentjz/777f 和 agentjz/ohmyflight。",
        toolCalls: [],
      };
    },
  });

  assert.equal(mainRequests.length, 1);
  assert.equal(memoryRequests.length, 1);
  assert.equal(memoryRequests[0]?.tools.length, 0);
  assert.match(String(memoryRequests[0]?.messages[0]?.content ?? ""), /Update same-session memory/);
  assert.match(String(memoryRequests[0]?.messages[1]?.content ?? ""), /Current user input/);
  assert.match(result.session.sessionMemory?.summary ?? "", /txt 纯文本回答/);
  assert.match(result.session.sessionMemory?.summary ?? "", /agentjz\/777f/);
  assert.match(result.session.sessionMemory?.summary ?? "", /agentjz\/ohmyflight/);
});

test("next turn injects model-written session memory while raw provider messages keep only current user frame", async (t) => {
  const root = await createTempWorkspace("session-memory-prompt", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    messages: [
      {
        role: "user",
        content: "请以后用 txt 纯文本回答，并比较 agentjz/777f 和 agentjz/ohmyflight。",
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
      summary: "用户要求本 session 用 txt 纯文本回答；当前任务是比较 agentjz/777f 和 agentjz/ohmyflight。",
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

  assert.match(prompt, /Model-written session memory/);
  assert.match(prompt, /txt 纯文本回答/);
  assert.match(prompt, /agentjz\/777f/);
  assert.match(prompt, /agentjz\/ohmyflight/);
  assert.equal(rawMessages, "你还记得刚刚的要求吗？");
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
    fetchSessionMemoryResponse: async (request): Promise<AssistantResponse> => {
      memoryRequests.push(request);
      return {
        content: "当前任务写入了 status.txt，并确认状态文件已经写入。",
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
