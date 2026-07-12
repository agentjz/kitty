import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { InteractionShell } from "../../src/interaction/shell.js";
import { mirrorInteractionShellToTerminalLog, type TerminalLogWriter } from "../../src/observability/terminalLog.js";
import { SessionStore } from "../../src/session/store.js";
import { startInteractiveChat } from "../../src/shell/cli/interactive.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("cli terminal log does not duplicate shell output through process mirroring", async (t) => {
  const root = await createTempWorkspace("terminal-log", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));

  await startInteractiveChat({
    cwd: root,
    config,
    session,
    sessionStore,
  }, {
    shell: createStdoutWritingClosedShell(),
  });

  const logPath = await findTerminalLogPath(root, session.id);
  const log = await fs.readFile(logPath, "utf8");
  assert.equal(countOccurrences(log, `会话: ${session.id}`), 1);
});

test("terminal log writes streamed assistant and reasoning text as readable blocks", () => {
  const chunks: string[] = [];
  const shell = mirrorInteractionShellToTerminalLog(createSilentShell(), createMemoryWriter(chunks));
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: createTestRuntimeConfig(process.cwd()),
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onReasoningDelta?.("我");
  display.callbacks.onReasoningDelta?.("是");
  display.callbacks.onReasoningDelta?.("GPT");
  display.callbacks.onAssistantDelta?.("当前");
  display.callbacks.onAssistantDelta?.("模型");
  display.callbacks.onAssistantDelta?.("运行");
  display.callbacks.onAssistantDone?.("当前模型运行");

  const log = chunks.join("");
  assert.match(log, /\[reasoning\]\n我是GPT\n/);
  assert.match(log, /\n当前模型运行\n/);
  assert.doesNotMatch(log, /^我$/m);
  assert.doesNotMatch(log, /^当前$/m);
});

test("terminal log does not duplicate streamed assistant text when status closes the block before done", () => {
  const chunks: string[] = [];
  const shell = mirrorInteractionShellToTerminalLog(createSilentShell(), createMemoryWriter(chunks));
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: createTestRuntimeConfig(process.cwd()),
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onAssistantDelta?.("我是 ");
  display.callbacks.onAssistantDelta?.("GPT-5.5。");
  display.callbacks.onStatus?.("总结中");
  display.callbacks.onAssistantDone?.("我是 GPT-5.5。");

  const log = chunks.join("");
  assert.equal(countOccurrences(log, "我是 GPT-5.5。"), 1);
});

test("terminal log records submitted input once and skips shell echo", async () => {
  const chunks: string[] = [];
  const shell = mirrorInteractionShellToTerminalLog(createSubmittedInputEchoShell("请问你是什么模型"), createMemoryWriter(chunks));
  const input = await shell.input.readInput("> ");
  shell.output.plain("> 请问你是什么模型");

  assert.deepEqual(input, { kind: "submit", value: "请问你是什么模型" });
  assert.equal(countOccurrences(chunks.join(""), "> 请问你是什么模型"), 1);
});

test("terminal log fallback keeps tool call arguments reviewable", () => {
  const chunks: string[] = [];
  const shell = mirrorInteractionShellToTerminalLog(createSilentShell(), createMemoryWriter(chunks));
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: createTestRuntimeConfig(process.cwd()),
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onToolCall?.("read", JSON.stringify({ path: "src/example.ts", offset: 2, limit: 3 }));

  const log = chunks.join("");
  assert.match(log, /\[工具\] read src[\\/]example\.ts:2-4/);
  assert.doesNotMatch(log, /\(missing path\)/);
});

test("terminal log wrapper preserves turn display lifecycle", () => {
  const lifecycle: string[] = [];
  const shell = mirrorInteractionShellToTerminalLog({
    ...createSilentShell(),
    createTurnDisplay() {
      return {
        callbacks: {},
        start() {
          lifecycle.push("started");
        },
        finish(status) {
          lifecycle.push(status);
        },
        flush() {},
        dispose() {},
      };
    },
  }, createMemoryWriter([]));
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: createTestRuntimeConfig(process.cwd()),
    abortSignal: new AbortController().signal,
  });

  display.start?.();
  display.finish?.("completed");

  assert.deepEqual(lifecycle, ["started", "completed"]);
});

function createStdoutWritingClosedShell(): InteractionShell {
  const write = (text: string): void => {
    process.stdout.write(`${text}\n`);
  };

  return {
    input: {
      async readInput() {
        return { kind: "closed" };
      },
      bindInterrupt() {
        return () => undefined;
      },
    },
    output: {
      plain: write,
      info: write,
      warn: write,
      error: write,
      dim: write,
      heading: write,
      interrupt: write,
    },
    createTurnDisplay() {
      return {
        callbacks: {},
        flush() {},
        dispose() {},
      };
    },
  };
}

function createSilentShell(): InteractionShell {
  return {
    input: {
      async readInput() {
        return { kind: "closed" };
      },
      bindInterrupt() {
        return () => undefined;
      },
    },
    output: {
      plain: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      dim: () => undefined,
      heading: () => undefined,
      interrupt: () => undefined,
    },
    createTurnDisplay() {
      return {
        callbacks: {},
        flush() {},
        dispose() {},
      };
    },
  };
}

function createSubmittedInputEchoShell(value: string): InteractionShell {
  return {
    ...createSilentShell(),
    input: {
      async readInput() {
        return { kind: "submit", value };
      },
      bindInterrupt() {
        return () => undefined;
      },
    },
  };
}

function createMemoryWriter(chunks: string[]): TerminalLogWriter {
  return {
    write(text) {
      chunks.push(text);
    },
  };
}

async function findTerminalLogPath(root: string, sessionId: string): Promise<string> {
  const terminalRoot = path.join(root, ".kitty", "observability", "terminal");
  const dates = await fs.readdir(terminalRoot);
  for (const date of dates) {
    const candidate = path.join(terminalRoot, date, `${sessionId}.log`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep looking across date directories.
    }
  }
  throw new Error(`Terminal log not found for ${sessionId}`);
}

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}
