import type { SessionRecord, StoredMessage } from "../../types.js";
import { TUI_COLORS } from "./theme.js";
import {
  measureTranscriptRows as measureTranscriptLayoutRows,
  renderTranscriptLineViews as renderTranscriptLayoutLineViews,
  renderTranscriptRows as renderTranscriptLayoutRows,
  type TuiTranscriptEntry,
  type TuiTranscriptLineView,
  type TuiTranscriptLineSpan,
  type TuiTranscriptRole,
} from "./transcriptLayout.js";

export type {
  TuiTranscriptEntry,
  TuiTranscriptLineView,
  TuiTranscriptLineSpan,
  TuiTranscriptRole,
} from "./transcriptLayout.js";

export interface TuiRuntimeDockState {
  current?: string;
  background?: string;
  subagent?: string;
  context: string;
}

export interface TuiScrollState {
  offset: number;
  stickToBottom: boolean;
  newContentPending: boolean;
}

export interface TuiState {
  transcript: TuiTranscriptEntry[];
  dock: TuiRuntimeDockState;
  scroll: TuiScrollState;
  composer: {
    promptLabel: string;
    visibleRows: number;
  };
}

export interface TuiViewport {
  width: number;
  height: number;
}

export interface TuiTranscriptProjectionLike {
  measureRows(entries: readonly TuiTranscriptEntry[], width: number): number;
  renderLineViews(entries: readonly TuiTranscriptEntry[], width: number): TuiTranscriptLineView[];
}

interface TuiProjectionOptions {
  readonly projection?: TuiTranscriptProjectionLike;
}

const DEFAULT_DOCK: TuiRuntimeDockState = {
  context: "0 chars (0%)",
};

export function createInitialTuiState(session?: SessionRecord): TuiState {
  return {
    transcript: session ? session.messages.flatMap(toTranscriptEntry) : [],
    dock: {
      ...DEFAULT_DOCK,
      context: formatContextBudget(session),
    },
    scroll: {
      offset: 0,
      stickToBottom: true,
      newContentPending: false,
    },
    composer: {
      promptLabel: "> ",
      visibleRows: 1,
    },
  };
}

export function appendTranscriptEntry(
  state: TuiState,
  entry: Omit<TuiTranscriptEntry, "id">,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  const next = {
    ...state,
    transcript: [...state.transcript, { ...entry, id: createEntryId(state.transcript.length) }],
  };
  return applyContentChange(next, viewport, options);
}

export function appendTranscriptText(
  state: TuiState,
  role: TuiTranscriptRole,
  text: string,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  const last = state.transcript[state.transcript.length - 1];
  if (last && last.role === role && (role === "assistant" || role === "reasoning")) {
    const transcript = state.transcript.slice(0, -1);
    const next = {
      ...state,
      transcript: [...transcript, { ...last, text: `${last.text}${text}` }],
    };
    return applyContentChange(next, viewport, options);
  }
  return appendTranscriptEntry(state, { role, text }, viewport, options);
}

export function updateRuntimeDock(state: TuiState, dock: Partial<TuiRuntimeDockState>): TuiState {
  return {
    ...state,
    dock: {
      ...state.dock,
      ...dock,
    },
  };
}

export function updateComposerState(
  state: TuiState,
  composer: Partial<TuiState["composer"]>,
): TuiState {
  return {
    ...state,
    composer: {
      ...state.composer,
      ...composer,
    },
  };
}

export function scrollTuiTranscript(
  state: TuiState,
  viewport: TuiViewport,
  delta: number,
  options: TuiProjectionOptions = {},
): TuiState {
  const maxOffset = getMaxScrollOffset(state, viewport, options);
  const offset = clamp(state.scroll.offset + delta, 0, maxOffset);
  return {
    ...state,
    scroll: {
      offset,
      stickToBottom: offset >= maxOffset,
      newContentPending: offset >= maxOffset ? false : state.scroll.newContentPending,
    },
  };
}

export function scrollTuiTranscriptToTop(state: TuiState): TuiState {
  return {
    ...state,
    scroll: {
      offset: 0,
      stickToBottom: false,
      newContentPending: state.scroll.newContentPending,
    },
  };
}

export function scrollTuiTranscriptToBottom(
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  return {
    ...state,
    scroll: {
      offset: getMaxScrollOffset(state, viewport, options),
      stickToBottom: true,
      newContentPending: false,
    },
  };
}

export function applyViewportResize(
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  if (state.scroll.stickToBottom) {
    return scrollTuiTranscriptToBottom(state, viewport, options);
  }
  return {
    ...state,
    scroll: {
      ...state.scroll,
      offset: clamp(state.scroll.offset, 0, getMaxScrollOffset(state, viewport, options)),
    },
  };
}

export function getMaxScrollOffset(
  state: Pick<TuiState, "transcript">,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): number {
  const rows = options.projection
    ? options.projection.measureRows(state.transcript, viewport.width)
    : measureTranscriptRows(state.transcript, viewport.width);
  return Math.max(0, rows - viewport.height);
}

export function getVisibleTranscriptRows(
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): string[] {
  const rows = options.projection
    ? options.projection.renderLineViews(state.transcript, viewport.width)
    : renderTranscriptLineViews(state.transcript, viewport.width);
  return rows
    .slice(state.scroll.offset, state.scroll.offset + viewport.height)
    .map((line) => line.text);
}

export function renderTranscriptRows(entries: readonly TuiTranscriptEntry[], width: number): string[] {
  return renderTranscriptLayoutRows(entries, width, TUI_COLORS);
}

export function measureTranscriptRows(entries: readonly TuiTranscriptEntry[], width: number): number {
  return measureTranscriptLayoutRows(entries, width, TUI_COLORS);
}

export function renderTranscriptLineViews(
  entries: readonly TuiTranscriptEntry[],
  width: number,
): TuiTranscriptLineView[] {
  return renderTranscriptLayoutLineViews(entries, width, TUI_COLORS);
}

export function formatContextBudget(session: SessionRecord | undefined): string {
  const budget = session?.contextBudget;
  if (!budget) {
    return "0 chars (0%)";
  }
  const percent = Math.round(budget.usageRatio * 100);
  return `${budget.estimatedChars}/${budget.limitChars} chars (${percent}%)`;
}

function applyContentChange(
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions,
): TuiState {
  if (state.scroll.stickToBottom) {
    return scrollTuiTranscriptToBottom(state, viewport, options);
  }
  return {
    ...state,
    scroll: {
      ...state.scroll,
      newContentPending: true,
    },
  };
}

function toTranscriptEntry(message: StoredMessage, index: number): TuiTranscriptEntry[] {
  if (message.source === "internal" || !message.content?.trim()) {
    return [];
  }
  if (message.role === "user") {
    return [{ id: createEntryId(index), role: "user", text: message.content }];
  }
  if (message.role === "assistant") {
    return [{ id: createEntryId(index), role: "assistant", text: message.content }];
  }
  return [];
}

export function parseSubmittedInputEcho(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || !lines[0]?.startsWith("> ")) {
    return undefined;
  }
  const parsed = lines.map((line, index) => {
    const prefix = index === 0 ? "> " : "… ";
    return line.startsWith(prefix) ? line.slice(prefix.length) : line;
  }).join("\n");
  return parsed.trim() ? parsed : undefined;
}

function createEntryId(index: number): string {
  return `entry-${index + 1}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
