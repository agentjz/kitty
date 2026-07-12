import { buildToolFailureDetail, buildToolResultDisplay } from "./toolDisplay.js";
import {
  normalizeTerminalVerbosity,
  shouldShowToolCallPreview,
  shouldShowToolResultPreview,
  truncateVisiblePreview,
  type TerminalVerbosity,
} from "./previewPolicy.js";
import { colorizeTodoMarkers } from "./todoStyling.js";
import { writeStdout, writeStdoutLine } from "../utils/stdio.js";
import type { RuntimeUiChannel, RuntimeUiEvent } from "./events.js";
import { colorRuntimeUiText, formatRuntimeUiChannelHeader, formatRuntimeUiSemanticTag } from "./theme.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../i18n/index.js";

export interface RuntimeUiTerminalRenderer {
  render(event: RuntimeUiEvent): void;
  flush(): void;
}

export interface RuntimeUiFormatOptions {
  cwd?: string;
  locale?: KittyLocale;
  terminalVerbosity?: TerminalVerbosity;
  toolArgsMaxChars?: number;
}

export function createRuntimeUiTerminalRenderer(options: {
  cwd?: string;
  locale?: KittyLocale;
  showReasoning?: boolean;
  terminalVerbosity?: TerminalVerbosity;
  assistantLeadingBlankLine?: boolean;
  assistantTrailingNewlines?: string;
  reasoningLeadingBlankLine?: boolean;
  toolArgsMaxChars?: number;
} = {}): RuntimeUiTerminalRenderer {
  const verbosity = normalizeTerminalVerbosity(options.terminalVerbosity);
  const locale = options.locale ?? DEFAULT_LOCALE;
  const state = {
    assistantOpen: false,
    reasoningOpen: false,
    channel: undefined as RuntimeUiChannel | undefined,
  };

  const flush = (): void => {
    if (!state.reasoningOpen && !state.assistantOpen) {
      return;
    }
    writeStdout("\n");
    state.reasoningOpen = false;
    state.assistantOpen = false;
  };

  const beginReasoning = (channel: RuntimeUiChannel): void => {
    if (options.showReasoning !== true) {
      return;
    }
    ensureChannel(channel);
    if (!state.reasoningOpen) {
      const label = colorRuntimeUiText("system", `[${translate(locale, "runtime.reasoning")}]`);
      writeStdout(options.reasoningLeadingBlankLine ? `\n${label}\n` : `${label}\n`);
      state.reasoningOpen = true;
    }
  };

  const beginAssistant = (channel: RuntimeUiChannel): void => {
    ensureChannel(channel);
    if (state.reasoningOpen) {
      writeStdout("\n");
      state.reasoningOpen = false;
    }
    if (!state.assistantOpen) {
      if (options.assistantLeadingBlankLine) {
        writeStdout("\n");
      }
      state.assistantOpen = true;
    }
  };

  const ensureChannel = (channel: RuntimeUiChannel): void => {
    if (state.channel === channel) {
      return;
    }
    if (state.reasoningOpen || state.assistantOpen) {
      writeStdout("\n");
      state.reasoningOpen = false;
      state.assistantOpen = false;
    }
    if (state.channel !== undefined) {
      writeStdout("\n");
    }
    writeStdoutLine(formatRuntimeUiChannelHeader(channel, locale));
    state.channel = channel;
  };

  return {
    flush,
    render(event) {
      switch (event.kind) {
        case "assistant_text":
          beginAssistant(event.channel);
          writeStdout(event.message ?? "");
          return;
        case "reasoning":
          if (options.showReasoning !== true) {
            return;
          }
          beginReasoning(event.channel);
          writeStdout(colorRuntimeUiText(event.channel, event.message ?? ""));
          return;
        case "status":
          flush();
          writeFormattedLine(event, state, options, verbosity);
          return;
        case "tool_call":
          flush();
          renderToolCall(event, state, options, verbosity);
          return;
        case "tool_result":
          flush();
          renderToolResult(event, state, options, verbosity);
          return;
        case "tool_error":
          flush();
          renderToolError(event, state, options);
          return;
      }
    },
  };
}

export function formatRuntimeUiEventLine(event: RuntimeUiEvent, options: RuntimeUiFormatOptions = {}): string {
  const verbosity = normalizeTerminalVerbosity(options.terminalVerbosity);
  const message = formatRuntimeUiEventMessage(event, options, verbosity);
  return formatRuntimeUiEventPlainLine(event, message, options.locale ?? DEFAULT_LOCALE);
}

export function finishRuntimeUiAssistantOutput(renderer: RuntimeUiTerminalRenderer, trailingNewlines = "\n"): void {
  renderer.flush();
  if (trailingNewlines.length > 0) {
    writeStdout(trailingNewlines);
  }
}

function renderToolCall(
  event: RuntimeUiEvent,
  state: { channel?: RuntimeUiChannel },
  options: { cwd?: string; locale?: KittyLocale; toolArgsMaxChars?: number },
  verbosity: TerminalVerbosity,
): void {
  const locale = options.locale ?? DEFAULT_LOCALE;
  ensureRenderChannel(state, event.channel, locale);
  writeSemanticLine("tool", formatRuntimeUiEventMessage(event, options, verbosity), undefined, locale);
}

function renderToolResult(
  event: RuntimeUiEvent,
  state: { channel?: RuntimeUiChannel },
  options: { cwd?: string; locale?: KittyLocale },
  verbosity: TerminalVerbosity,
): void {
  const locale = options.locale ?? DEFAULT_LOCALE;
  ensureRenderChannel(state, event.channel, locale);
  const name = event.toolName ?? "tool";
  const display = buildToolResultDisplay(name, event.payload ?? event.message ?? "", options.cwd);
  const ok = event.ok ?? display.ok !== false;
  if (!ok) {
    const detail = buildToolFailureDetail(name, event.payload ?? event.message ?? "", options.cwd);
    writeSemanticLine("result", formatRuntimeUiEventMessage(event, options, verbosity, detail), "failed", locale);
  }
  if (display.preview && shouldShowToolResultPreview(name, verbosity)) {
    const preview = name === "todo_write"
      ? colorizeTodoMarkers(display.preview)
      : truncateVisiblePreview(display.preview);
    writePreview(event.channel, "preview", preview, verbosity, locale);
  }
}

function renderToolError(event: RuntimeUiEvent, state: { channel?: RuntimeUiChannel }, options: { cwd?: string; locale?: KittyLocale }): void {
  const locale = options.locale ?? DEFAULT_LOCALE;
  ensureRenderChannel(state, event.channel, locale);
  const name = event.toolName ?? "tool";
  const detail = buildToolFailureDetail(name, event.payload ?? event.message ?? "", options.cwd);
  writeSemanticLine("result", formatRuntimeUiEventMessage(event, options, "normal", detail), "failed", locale);
}

function writePreview(
  channel: RuntimeUiChannel,
  label: "content" | "preview",
  preview: string,
  verbosity: TerminalVerbosity,
  locale: KittyLocale,
): void {
  if (verbosity === "minimal") {
    writeStdoutLine(colorRuntimeUiText(channel, preview));
    return;
  }
  writeStdoutLine(`${formatRuntimeUiSemanticTag(label, undefined, locale)}\n${colorRuntimeUiText(channel, preview)}`);
}

function writeSemanticLine(
  tag: "tool" | "result",
  message: string,
  state?: "ok" | "failed",
  locale: KittyLocale = DEFAULT_LOCALE,
): void {
  writeStdoutLine(`${formatRuntimeUiSemanticTag(tag, state, locale)} ${message}`.trimEnd());
}

function writeFormattedLine(
  event: RuntimeUiEvent,
  state: { channel?: RuntimeUiChannel },
  options: RuntimeUiFormatOptions,
  verbosity: TerminalVerbosity,
): void {
  ensureRenderChannel(state, event.channel, options.locale ?? DEFAULT_LOCALE);
  const message = formatRuntimeUiEventMessage(event, options, verbosity);
  writeStdoutLine(colorRuntimeUiText(event.channel, message));
}

function formatRuntimeUiEventMessage(
  event: RuntimeUiEvent,
  options: RuntimeUiFormatOptions,
  verbosity: TerminalVerbosity,
  forcedDetail?: string,
): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  switch (event.kind) {
    case "status":
      return event.message ?? "";
    case "tool_call": {
      const name = event.toolName ?? "tool";
      return name;
    }
    case "tool_result": {
      const name = event.toolName ?? "tool";
      const display = buildToolResultDisplay(name, event.payload ?? event.message ?? "", options.cwd);
      const ok = event.ok ?? display.ok !== false;
      const status = translate(locale, ok ? "common.ok" : "common.failed");
      const summary = `${name} ${status}`;
      if (!ok) {
        const detail = forcedDetail ?? buildToolFailureDetail(name, event.payload ?? event.message ?? "", options.cwd);
        return formatRuntimeUiMessage(summary, detail);
      }
      return summary;
    }
    case "tool_error": {
      const name = event.toolName ?? "tool";
      const detail = forcedDetail ?? buildToolFailureDetail(name, event.payload ?? event.message ?? "", options.cwd);
      return formatRuntimeUiMessage(`${name} ${translate(locale, "common.failed")}`, detail);
    }
    case "assistant_text":
    case "reasoning":
      return event.message ?? "";
  }
}

function formatRuntimeUiEventPlainLine(event: RuntimeUiEvent, message: string, locale: KittyLocale): string {
  switch (event.kind) {
    case "tool_call":
      return `[${translate(locale, "runtime.tool")}] ${message}`.trimEnd();
    case "tool_result": {
      const display = buildToolResultDisplay(event.toolName ?? "tool", event.payload ?? event.message ?? "");
      if (event.ok ?? display.ok !== false) return "";
      return `[${translate(locale, "runtime.result")}] ${message}`.trimEnd();
    }
    case "tool_error":
      return `[${translate(locale, "runtime.result")}] ${message}`.trimEnd();
    default:
      return message.trimEnd();
  }
}

function ensureRenderChannel(
  state: { channel?: RuntimeUiChannel },
  channel: RuntimeUiChannel,
  locale: KittyLocale,
): void {
  if (state.channel === channel) {
    return;
  }
  if (state.channel !== undefined) {
    writeStdout("\n");
  }
  writeStdoutLine(formatRuntimeUiChannelHeader(channel, locale));
  state.channel = channel;
}

function formatRuntimeUiMessage(summary: string, detail?: string): string {
  return detail ? `${summary}: ${detail}` : summary;
}
