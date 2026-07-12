import type { SessionRecord, StoredMessage } from "../../types.js";
import type { RuntimeStatus } from "../../runtime/status.js";
import type { TuiActivity } from "./activity.js";
import { projectTuiExecutionDockFacts } from "./executionDock.js";
import { TUI_COLORS } from "./theme.js";
import { DEFAULT_LOCALE, type KittyLocale } from "../../i18n/index.js";
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
  activity?: TuiActivity;
  background?: string;
  context: string;
  model?: string;
  turnStartedAt?: number;
}

export interface TuiScrollState {
  offset: number;
  mode: "follow" | "detached";
  unseenRows: number;
  anchorLineId?: string;
}

export interface TuiSelectionPoint {
  rowId: string;
  column: number;
}

export interface TuiSelectionState {
  anchor?: TuiSelectionPoint;
  focus?: TuiSelectionPoint;
  dragging: boolean;
}

export type TuiOverlayState =
  | { kind: "closed" }
  | { kind: "slashCommands"; query: string; selectedIndex: number }
  | { kind: "commandPalette"; query: string; selectedIndex: number }
  | { kind: "historySearch"; query: string; selectedIndex: number }
  | { kind: "keyboardHelp"; offset: number };

export interface TuiComposerState {
  cursor: number;
  history: string[];
  historyIndex: number;
  killBuffer: string;
  promptLabel: string;
  stashedDraft?: { cursor: number; value: string };
  value: string;
  visibleRows: number;
}

export interface TuiState {
  locale: KittyLocale;
  transcript: TuiTranscriptEntry[];
  dock: TuiRuntimeDockState;
  scroll: TuiScrollState;
  composer: TuiComposerState;
  overlay: TuiOverlayState;
  selection: TuiSelectionState;
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
  context: "0%",
};

export function createInitialTuiState(session?: SessionRecord, locale: KittyLocale = DEFAULT_LOCALE): TuiState {
  const history = collectSessionInputHistory(session);
  return {
    locale,
    transcript: session ? session.messages.flatMap(toTranscriptEntry) : [],
    dock: {
      ...DEFAULT_DOCK,
      context: formatContextBudget(session),
    },
    scroll: {
      offset: 0,
      mode: "follow",
      unseenRows: 0,
    },
    composer: {
      cursor: 0,
      history,
      historyIndex: history.length,
      killBuffer: "",
      promptLabel: "> ",
      value: "",
      visibleRows: 1,
    },
    overlay: { kind: "closed" },
    selection: { dragging: false },
  };
}

export function hasTuiConversation(state: Pick<TuiState, "transcript">): boolean {
  return state.transcript.some((entry) => entry.role !== "system");
}

export function appendTranscriptEntry(
  state: TuiState,
  entry: Omit<TuiTranscriptEntry, "id">,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  const next = {
    ...state,
    transcript: [...state.transcript, { ...entry, id: createNextEntryId(state.transcript) }],
  };
  return applyContentChange(state, next, viewport, options);
}

export function appendTranscriptText(
  state: TuiState,
  role: TuiTranscriptRole,
  text: string,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  const last = state.transcript[state.transcript.length - 1];
  if (last && last.role === role && (
    role === "assistant"
    || role === "reasoning"
  )) {
    const transcript = state.transcript.slice(0, -1);
    const next = {
      ...state,
      transcript: [...transcript, { ...last, text: `${last.text}${text}` }],
    };
    return applyContentChange(state, next, viewport, options);
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

export function toggleLatestTranscriptDetails(
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  let index = -1;
  for (let candidate = state.transcript.length - 1; candidate >= 0; candidate -= 1) {
    if (state.transcript[candidate]?.details) {
      index = candidate;
      break;
    }
  }
  if (index < 0) {
    return state;
  }
  const entry = state.transcript[index]!;
  const transcript = state.transcript.slice();
  transcript[index] = { ...entry, expanded: !entry.expanded };
  const changed = applyContentChange(state, { ...state, transcript }, viewport, options);
  return {
    ...changed,
    scroll: {
      ...changed.scroll,
      unseenRows: state.scroll.unseenRows,
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
  const rows = renderProjectionRows(state, viewport.width, options);
  const mode = offset >= maxOffset ? "follow" : "detached";
  return {
    ...state,
    scroll: {
      offset,
      mode,
      unseenRows: mode === "follow" ? 0 : state.scroll.unseenRows,
      anchorLineId: mode === "detached" ? rows[offset]?.id : undefined,
    },
  };
}

export function scrollTuiTranscriptToTop(
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  return {
    ...state,
    scroll: {
      offset: 0,
      mode: "detached",
      unseenRows: state.scroll.unseenRows,
      anchorLineId: renderProjectionRows(state, viewport.width, options)[0]?.id,
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
      mode: "follow",
      unseenRows: 0,
      anchorLineId: undefined,
    },
  };
}

export function applyViewportResize(
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): TuiState {
  if (state.scroll.mode === "follow") {
    return scrollTuiTranscriptToBottom(state, viewport, options);
  }
  const rows = renderProjectionRows(state, viewport.width, options);
  const anchoredOffset = state.scroll.anchorLineId
    ? rows.findIndex((row) => row.id === state.scroll.anchorLineId)
    : -1;
  const offset = clamp(
    anchoredOffset >= 0 ? anchoredOffset : state.scroll.offset,
    0,
    getMaxScrollOffset(state, viewport, options),
  );
  return {
    ...state,
    scroll: {
      ...state.scroll,
      offset,
      anchorLineId: rows[offset]?.id,
    },
  };
}

export function getMaxScrollOffset(
  state: Pick<TuiState, "transcript" | "locale">,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): number {
  const rows = options.projection
    ? options.projection.measureRows(state.transcript, viewport.width)
    : measureTranscriptRows(state.transcript, viewport.width, state.locale);
  return Math.max(0, rows - viewport.height);
}

export function getVisibleTranscriptRows(
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions = {},
): string[] {
  const rows = options.projection
    ? options.projection.renderLineViews(state.transcript, viewport.width)
    : renderTranscriptLineViews(state.transcript, viewport.width, state.locale);
  return rows
    .slice(state.scroll.offset, state.scroll.offset + viewport.height)
    .map((line) => line.text);
}

export function renderTranscriptRows(
  entries: readonly TuiTranscriptEntry[],
  width: number,
  locale: KittyLocale = DEFAULT_LOCALE,
): string[] {
  return renderTranscriptLayoutRows(entries, width, TUI_COLORS, locale);
}

export function measureTranscriptRows(
  entries: readonly TuiTranscriptEntry[],
  width: number,
  locale: KittyLocale = DEFAULT_LOCALE,
): number {
  return measureTranscriptLayoutRows(entries, width, TUI_COLORS, locale);
}

export function renderTranscriptLineViews(
  entries: readonly TuiTranscriptEntry[],
  width: number,
  locale: KittyLocale = DEFAULT_LOCALE,
): TuiTranscriptLineView[] {
  return renderTranscriptLayoutLineViews(entries, width, TUI_COLORS, locale);
}

export function formatContextBudget(session: Pick<SessionRecord, "contextBudget"> | undefined): string {
  const budget = session?.contextBudget;
  if (!budget) {
    return "0%";
  }
  const percent = Math.round(budget.usageRatio * 100);
  return `${budget.estimatedChars}/${budget.limitChars} chars (${percent}%)`;
}

export function updateOverlayState(state: TuiState, overlay: TuiOverlayState): TuiState {
  return {
    ...state,
    overlay,
  };
}

export function updateSelectionState(state: TuiState, selection: TuiSelectionState): TuiState {
  return {
    ...state,
    selection,
  };
}

export function projectRuntimeStatusToDock(
  status: RuntimeStatus,
  activeSession: Pick<SessionRecord, "contextBudget"> | undefined,
): Partial<TuiRuntimeDockState> {
  return {
    ...projectTuiExecutionDockFacts(status.scene.executions),
    context: formatContextBudget(activeSession),
  };
}

function applyContentChange(
  previous: TuiState,
  state: TuiState,
  viewport: TuiViewport,
  options: TuiProjectionOptions,
): TuiState {
  if (previous.scroll.mode === "follow") {
    return scrollTuiTranscriptToBottom(state, viewport, options);
  }
  const previousRows = renderProjectionRows(previous, viewport.width, options);
  const rows = renderProjectionRows(state, viewport.width, options);
  const anchoredOffset = previous.scroll.anchorLineId
    ? rows.findIndex((row) => row.id === previous.scroll.anchorLineId)
    : -1;
  return {
    ...state,
    scroll: {
      ...previous.scroll,
      offset: clamp(
        anchoredOffset >= 0 ? anchoredOffset : previous.scroll.offset,
        0,
        Math.max(0, rows.length - viewport.height),
      ),
      unseenRows: previous.scroll.unseenRows + Math.max(1, rows.length - previousRows.length),
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

function renderProjectionRows(
  state: Pick<TuiState, "transcript" | "locale">,
  width: number,
  options: TuiProjectionOptions,
): TuiTranscriptLineView[] {
  return options.projection
    ? options.projection.renderLineViews(state.transcript, width)
    : renderTranscriptLineViews(state.transcript, width, state.locale);
}

function collectSessionInputHistory(session: SessionRecord | undefined): string[] {
  if (!session) {
    return [];
  }
  return session.messages
    .filter((message) => message.role === "user" && message.source !== "internal" && Boolean(message.content?.trim()))
    .map((message) => message.content!.trim());
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

function createNextEntryId(entries: readonly TuiTranscriptEntry[]): string {
  const nextIndex = entries.reduce((maximum, entry) => {
    const match = /^entry-(\d+)$/.exec(entry.id);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
  return `entry-${nextIndex}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
