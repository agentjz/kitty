import type { SessionRecord, StoredMessage } from "../../types.js";
import { renderMarkdownLines } from "./markdown.js";
import wrapAnsi from "wrap-ansi";

export type TuiTranscriptRole = "user" | "assistant" | "reasoning" | "system";

export interface TuiTranscriptEntry {
  id: string;
  role: TuiTranscriptRole;
  text: string;
}

export interface TuiTranscriptLineView {
  id: string;
  entryId: string;
  role: TuiTranscriptRole;
  kind: "spacer" | "content";
  text: string;
  isFirstContentLine: boolean;
}

export interface TuiRuntimeDockState {
  work: {
    active: boolean;
    label: string;
    detail: string;
  };
  background: string;
  subagent: string;
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

const DEFAULT_DOCK: TuiRuntimeDockState = {
  work: {
    active: false,
    label: "空闲",
    detail: "没有后台任务或子代理正在执行",
  },
  background: "空闲",
  subagent: "空闲",
  context: "未知",
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
): TuiState {
  const next = {
    ...state,
    transcript: [...state.transcript, { ...entry, id: createEntryId(state.transcript.length) }],
  };
  return applyContentChange(next, viewport);
}

export function appendTranscriptText(
  state: TuiState,
  role: TuiTranscriptRole,
  text: string,
  viewport: TuiViewport,
): TuiState {
  const last = state.transcript[state.transcript.length - 1];
  if (last && last.role === role && (role === "assistant" || role === "reasoning")) {
    const transcript = state.transcript.slice(0, -1);
    const next = {
      ...state,
      transcript: [...transcript, { ...last, text: `${last.text}${text}` }],
    };
    return applyContentChange(next, viewport);
  }
  return appendTranscriptEntry(state, { role, text }, viewport);
}

export function updateRuntimeDock(state: TuiState, dock: Partial<TuiRuntimeDockState>): TuiState {
  return {
    ...state,
    dock: {
      ...state.dock,
      ...dock,
      work: {
        ...state.dock.work,
        ...dock.work,
      },
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

export function scrollTuiTranscript(state: TuiState, viewport: TuiViewport, delta: number): TuiState {
  const maxOffset = getMaxScrollOffset(state, viewport);
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

export function scrollTuiTranscriptToBottom(state: TuiState, viewport: TuiViewport): TuiState {
  return {
    ...state,
    scroll: {
      offset: getMaxScrollOffset(state, viewport),
      stickToBottom: true,
      newContentPending: false,
    },
  };
}

export function applyViewportResize(state: TuiState, viewport: TuiViewport): TuiState {
  if (state.scroll.stickToBottom) {
    return scrollTuiTranscriptToBottom(state, viewport);
  }
  return {
    ...state,
    scroll: {
      ...state.scroll,
      offset: clamp(state.scroll.offset, 0, getMaxScrollOffset(state, viewport)),
    },
  };
}

export function getMaxScrollOffset(state: Pick<TuiState, "transcript">, viewport: TuiViewport): number {
  return Math.max(0, measureTranscriptRows(state.transcript, viewport.width) - viewport.height);
}

export function getVisibleTranscriptRows(state: TuiState, viewport: TuiViewport): string[] {
  return renderTranscriptLineViews(state.transcript, viewport.width)
    .slice(state.scroll.offset, state.scroll.offset + viewport.height)
    .map((line) => line.text);
}

export function renderTranscriptRows(entries: readonly TuiTranscriptEntry[], width: number): string[] {
  return renderTranscriptLineViews(entries, width).map((line) => line.text);
}

export function measureTranscriptRows(entries: readonly TuiTranscriptEntry[], width: number): number {
  return renderTranscriptLineViews(entries, width).length;
}

export function renderTranscriptLineViews(
  entries: readonly TuiTranscriptEntry[],
  width: number,
): TuiTranscriptLineView[] {
  return entries.flatMap((entry) => renderEntryLineViews(entry, width));
}

export function formatContextBudget(session: SessionRecord | undefined): string {
  const budget = session?.contextBudget;
  if (!budget) {
    return "未知";
  }
  const percent = Math.round(budget.usageRatio * 100);
  return `${budget.estimatedChars}/${budget.limitChars} chars (${percent}%)`;
}

function applyContentChange(state: TuiState, viewport: TuiViewport): TuiState {
  if (state.scroll.stickToBottom) {
    return scrollTuiTranscriptToBottom(state, viewport);
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

function renderEntryRows(entry: TuiTranscriptEntry, width: number): string[] {
  return renderEntryLineViews(entry, width).map((line) => line.text);
}

function readEntryDisplayRows(entry: TuiTranscriptEntry): string[] {
  if (entry.role === "assistant" || entry.role === "reasoning") {
    const markdownRows = renderMarkdownLines(entry.text);
    return markdownRows.length > 0 ? markdownRows : [""];
  }
  return entry.text.split(/\r?\n/);
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

function wrapText(text: string, width: number): string[] {
  const rows: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const wrapped = wrapAnsi(line, width, { hard: true, trim: false });
    rows.push(...wrapped.split(/\r?\n/));
  }
  return rows.length > 0 ? rows : [""];
}

function createEntryId(index: number): string {
  return `entry-${index + 1}`;
}

function renderEntryLineViews(entry: TuiTranscriptEntry, width: number): TuiTranscriptLineView[] {
  const bodyWidth = Math.max(8, width - 6);
  const sourceRows = readEntryDisplayRows(entry);
  const wrapped = sourceRows.flatMap((line) => wrapText(line, bodyWidth));
  const rows = wrapped.length > 0 ? wrapped : [""];
  const entryId = entry.id;
  return [
    {
      id: `${entryId}-spacer`,
      entryId,
      role: entry.role,
      kind: "spacer",
      text: "",
      isFirstContentLine: false,
    },
    ...rows.map((row, index): TuiTranscriptLineView => ({
      id: `${entryId}-line-${index + 1}`,
      entryId,
      role: entry.role,
      kind: "content",
      text: row,
      isFirstContentLine: index === 0,
    })),
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
