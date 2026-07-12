import fs from "node:fs";
import path from "node:path";

import type { InteractionShell, InteractionTurnDisplay, ShellInputPort, ShellOutputPort } from "../interaction/shell.js";
import type { RuntimeConfig } from "../types.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { createRuntimeUiEvent } from "../runtime-ui/events.js";
import { formatRuntimeUiEventLine } from "../runtime-ui/terminalRenderer.js";

export interface TerminalLogWriter {
  write(text: string): void;
  dispose?(): void;
}

let outputMirrorSuppressDepth = 0;
let outputMirrorWriteCount = 0;

export function createTerminalLogWriter(rootDir: string, sessionId: string, now = new Date()): TerminalLogWriter {
  const timestamp = now.toISOString();
  const date = timestamp.slice(0, 10).replaceAll("-", "");
  const terminalDir = path.join(getProjectStatePaths(rootDir).observabilityDir, "terminal", date);
  fs.mkdirSync(terminalDir, { recursive: true });
  const logPath = path.join(terminalDir, `${safePathPart(sessionId)}.log`);
  return {
    write(text) {
      fs.appendFileSync(logPath, text, "utf8");
    },
  };
}

export function mirrorProcessOutputToTerminalLog(writer: TerminalLogWriter): () => void {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const writeSync = fs.writeSync;
  let active = true;

  process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
    if (active && outputMirrorSuppressDepth === 0) {
      writeMirroredProcessChunk(writer, chunk);
    }
    return (stdoutWrite as (...input: unknown[]) => boolean)(chunk, ...args);
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
    if (active && outputMirrorSuppressDepth === 0) {
      writeMirroredProcessChunk(writer, chunk);
    }
    return (stderrWrite as (...input: unknown[]) => boolean)(chunk, ...args);
  }) as typeof process.stderr.write;

  fs.writeSync = ((fd: number, buffer: unknown, ...args: unknown[]) => {
    if (active && outputMirrorSuppressDepth === 0 && (fd === 1 || fd === 2)) {
      writeMirroredProcessChunk(writer, buffer);
    }
    return (writeSync as (...input: unknown[]) => number)(fd, buffer, ...args);
  }) as typeof fs.writeSync;

  return () => {
    active = false;
    process.stdout.write = stdoutWrite as typeof process.stdout.write;
    process.stderr.write = stderrWrite as typeof process.stderr.write;
    fs.writeSync = writeSync;
    writer.dispose?.();
  };
}

function safePathPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || `session-${process.pid}`;
}

export function mirrorInteractionShellToTerminalLog(
  shell: InteractionShell,
  writer: TerminalLogWriter,
): InteractionShell {
  return {
    input: mirrorInput(shell.input, writer),
    output: mirrorOutput(shell.output, writer),
    createTurnDisplay(options) {
      return mirrorTurnDisplay(shell.createTurnDisplay(options), writer, options);
    },
    dispose() {
      shell.dispose?.();
    },
  };
}

function mirrorOutput(output: ShellOutputPort, writer: TerminalLogWriter): ShellOutputPort {
  return {
    plain(text) {
      if (isSubmittedInputEcho(text)) {
        forwardOutputOnly(() => output.plain(text));
        return;
      }
      writeOutputAndForward(writer, `${text}\n`, () => output.plain(text));
    },
    info(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.info(text));
    },
    warn(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.warn(text));
    },
    error(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.error(text));
    },
    dim(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.dim(text));
    },
    heading(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.heading(text));
    },
    interrupt(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.interrupt(text));
    },
  };
}

function forwardOutputOnly(forward: () => void): void {
  outputMirrorSuppressDepth += 1;
  try {
    forward();
  } finally {
    outputMirrorSuppressDepth -= 1;
  }
}

function writeOutputAndForward(writer: TerminalLogWriter, text: string, forward: () => void): void {
  outputMirrorWriteCount += 1;
  writer.write(text);
  outputMirrorSuppressDepth += 1;
  try {
    forward();
  } finally {
    outputMirrorSuppressDepth -= 1;
  }
}

function mirrorTurnDisplay(
  display: InteractionTurnDisplay,
  writer: TerminalLogWriter,
  options: {
    cwd: string;
    config: RuntimeConfig;
  },
): InteractionTurnDisplay {
  let assistantBuffer = "";
  let reasoningBuffer = "";
  let lastAssistantBlock = "";

  const flushReasoning = (): void => {
    const text = reasoningBuffer.trimEnd();
    reasoningBuffer = "";
    if (text.length > 0) {
      writer.write(`\n[reasoning]\n${text}\n`);
    }
  };

  const flushAssistant = (): void => {
    flushReasoning();
    const text = assistantBuffer.trimEnd();
    assistantBuffer = "";
    if (text.length > 0) {
      lastAssistantBlock = text;
      writer.write(`\n${text}\n`);
    }
  };

  const flushTextBuffers = (): void => {
    flushAssistant();
  };

  return {
    callbacks: {
      ...display.callbacks,
      onAssistantStage(text) {
        assistantBuffer += text;
        display.callbacks.onAssistantStage?.(text);
      },
      onAssistantDelta(delta) {
        assistantBuffer += delta;
        display.callbacks.onAssistantDelta?.(delta);
      },
      onAssistantText(text) {
        assistantBuffer += text;
        display.callbacks.onAssistantText?.(text);
      },
      onAssistantDone(text) {
        if (assistantBuffer.length === 0 && text.trimEnd() !== lastAssistantBlock) {
          assistantBuffer = text;
        }
        flushAssistant();
        display.callbacks.onAssistantDone?.(text);
      },
      onReasoningDelta(delta) {
        reasoningBuffer += delta;
        display.callbacks.onReasoningDelta?.(delta);
      },
      onReasoning(text) {
        reasoningBuffer += text;
        display.callbacks.onReasoning?.(text);
      },
      onStatus(message) {
        flushTextBuffers();
        forwardWithFallback(writer, () => display.callbacks.onStatus?.(message), `${message}\n`);
      },
      onToolCall(name, args) {
        flushTextBuffers();
        forwardWithFallback(writer, () => display.callbacks.onToolCall?.(name, args), formatRuntimeUiEventLine(createRuntimeUiEvent({
          channel: "lead",
          kind: "tool_call",
          toolName: name,
          payload: args,
        }), { cwd: options.cwd, locale: options.config.locale }));
      },
      onToolResult(name, output) {
        flushTextBuffers();
        forwardWithFallback(writer, () => display.callbacks.onToolResult?.(name, output), formatRuntimeUiEventLine(createRuntimeUiEvent({
          channel: "lead",
          kind: "tool_result",
          toolName: name,
          payload: output,
        }), { cwd: options.cwd, locale: options.config.locale }));
      },
      onToolError(name, error) {
        flushTextBuffers();
        forwardWithFallback(writer, () => display.callbacks.onToolError?.(name, error), formatRuntimeUiEventLine(createRuntimeUiEvent({
          channel: "lead",
          kind: "tool_error",
          toolName: name,
          payload: error,
        }), { cwd: options.cwd, locale: options.config.locale }));
      },
    },
    start() {
      display.start?.();
    },
    finish(status) {
      display.finish?.(status);
    },
    flush() {
      flushTextBuffers();
      display.flush();
    },
    dispose() {
      flushTextBuffers();
      display.dispose();
    },
  };
}

function forwardWithFallback(writer: TerminalLogWriter, forward: () => void, fallback: string): void {
  const before = outputMirrorWriteCount;
  forward();
  if (outputMirrorWriteCount === before && fallback.length > 0) {
    outputMirrorWriteCount += 1;
    writer.write(`${fallback}\n`);
  }
}

function mirrorInput(input: ShellInputPort, writer: TerminalLogWriter): ShellInputPort {
  return {
    async readInput(promptLabel) {
      const result = await input.readInput(promptLabel);
      if (result.kind === "submit") {
        writer.write(`${promptLabel ?? "> "}${result.value}\n`);
      }
      return result;
    },
    bindInterrupt(handler) {
      return input.bindInterrupt(handler);
    },
  };
}

function bufferToText(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString("utf8");
  }
  return String(chunk ?? "");
}

function writeMirroredProcessChunk(writer: TerminalLogWriter, chunk: unknown): void {
  const text = bufferToText(chunk);
  if (isTransientTerminalFrame(text)) {
    return;
  }
  outputMirrorWriteCount += 1;
  writer.write(text);
}

function isTransientTerminalFrame(text: string): boolean {
  const normalized = stripAnsi(text).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  return /^\r?\[[ ■]{4}\] thinking\s*$/.test(normalized);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function isSubmittedInputEcho(text: string): boolean {
  const lines = text.split(/\r?\n/);
  if (!lines[0]?.startsWith("> ")) {
    return false;
  }
  return lines.slice(1).every((line) => line.startsWith("… "));
}
