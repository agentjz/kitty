import type { SessionRecord } from "../../types.js";
import type { ComposerInputKey } from "./composerEditing.js";
import { TuiComposerInteraction } from "./composerInteraction.js";
import {
  appendTranscriptEntry,
  appendTranscriptText,
  applyViewportResize,
  parseSubmittedInputEcho,
  scrollTuiTranscript,
  scrollTuiTranscriptToBottom,
  scrollTuiTranscriptToTop,
  updateComposerState,
  updateOverlayState,
  updateRuntimeDock,
  updateSelectionState,
  createInitialTuiState,
  formatContextBudget,
  type TuiTranscriptLineView,
  type TuiTranscriptEntry,
  type TuiRuntimeDockState,
  type TuiState,
  type TuiTranscriptRole,
  type TuiViewport,
} from "./store.js";
import { TuiTranscriptProjection } from "./transcriptProjection.js";
import type { TuiMouseEvent } from "./input/scroll.js";
import {
  projectMouseSelectionPoint,
  projectSelectedLineViews,
  readSelectedText,
  type TuiSelectableTranscriptLineView,
} from "./selection.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../../i18n/index.js";

export type TuiStateListener = (state: TuiState) => void;

export type TuiInputResult =
  | { kind: "submit"; value: string }
  | { kind: "closed" };

interface PendingInput {
  resolve: (result: TuiInputResult) => void;
}

export interface TuiDraftStore {
  load(sessionId: string): { cursor: number; value: string } | undefined;
  save(sessionId: string, draft: { cursor: number; value: string }): void;
  clear(sessionId: string): boolean;
}

export interface TuiControllerOptions {
  draftStore?: TuiDraftStore;
  locale?: KittyLocale;
  writeClipboard?: (text: string) => Promise<void>;
}

const DEFAULT_VIEWPORT: TuiViewport = {
  width: 80,
  height: 18,
};

export class TuiController {
  private state: TuiState;
  private viewport: TuiViewport = DEFAULT_VIEWPORT;
  private readonly projection = new TuiTranscriptProjection();
  private listeners = new Set<TuiStateListener>();
  private pendingInput: PendingInput | null = null;
  private queuedInputs: string[] = [];
  private interruptHandler: (() => void) | undefined;
  private disposed = false;
  private sessionId: string | undefined;
  private readonly composerInteraction: TuiComposerInteraction;
  private selectionAutoScrollTimer: NodeJS.Timeout | undefined;
  private selectionAutoScrollDirection = 0;
  private selectionPointer: { x: number; y: number } | undefined;

  constructor(session?: SessionRecord, private readonly options: TuiControllerOptions = {}) {
    this.sessionId = session?.id;
    this.state = createInitialTuiState(session, options.locale ?? DEFAULT_LOCALE);
    const restoredDraft = this.sessionId ? options.draftStore?.load(this.sessionId) : undefined;
    if (restoredDraft) {
      this.state = updateComposerState(this.state, {
        cursor: Math.max(0, Math.min(restoredDraft.cursor, restoredDraft.value.length)),
        value: restoredDraft.value,
      });
    }
    this.composerInteraction = new TuiComposerInteraction({
      appendSystem: (text) => this.append("system", text),
      getState: () => this.state,
      isDisposed: () => this.disposed,
      persistDraft: () => this.persistComposerDraft(),
      setState: (state) => this.setState(state),
      submitInput: (value) => this.submitInput(value),
    });
    this.state = applyViewportResize(this.state, this.viewport, this.projectionOptions());
  }

  getState(): TuiState {
    return this.state;
  }

  subscribe(listener: TuiStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setViewport(viewport: TuiViewport): void {
    const nextViewport = {
      width: Math.max(20, Math.floor(viewport.width)),
      height: Math.max(1, Math.floor(viewport.height)),
    };
    this.viewport = nextViewport;
    this.setState(applyViewportResize(this.state, nextViewport, this.projectionOptions()));
  }

  readInput(promptLabel = "> "): Promise<TuiInputResult> {
    return this.openInput(promptLabel);
  }

  submitInput(value: string): boolean {
    if (this.disposed) {
      return false;
    }
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return false;
    }
    const history = appendInputHistory(this.state.composer.history, normalizedValue);
    if (this.sessionId && this.options.draftStore && !this.options.draftStore.clear(this.sessionId)) {
      this.append("system", translate(this.state.locale, "tui.draftBusy"));
      return false;
    }
    this.setState(updateComposerState(this.state, {
      cursor: 0,
      history,
      historyIndex: history.length,
      stashedDraft: undefined,
      value: "",
    }));
    this.setState(updateOverlayState(this.state, { kind: "closed" }));
    const pending = this.pendingInput;
    if (!pending) {
      this.queuedInputs.push(normalizedValue);
      return true;
    }
    this.pendingInput = null;
    this.setState(updateComposerState(this.state, {
      promptLabel: "> ",
    }));
    pending.resolve({ kind: "submit", value: normalizedValue });
    return true;
  }

  handleComposerInput(input: string, key: ComposerInputKey): void {
    this.composerInteraction.handleInput(input, key);
  }

  handleComposerPaste(text: string): void {
    this.composerInteraction.handlePaste(text);
  }

  async editComposerExternally(editor: (value: string) => Promise<string>): Promise<void> {
    await this.composerInteraction.editExternally(editor);
  }

  closeInput(): void {
    const pending = this.pendingInput;
    this.pendingInput = null;
    if (pending) {
      pending.resolve({ kind: "closed" });
    }
  }

  bindInterrupt(handler: () => void): () => void {
    this.interruptHandler = handler;
    return () => {
      if (this.interruptHandler === handler) {
        this.interruptHandler = undefined;
      }
    };
  }

  interrupt(): void {
    this.interruptHandler?.();
  }

  append(role: TuiTranscriptRole, text: string, options: {
    planItems?: TuiTranscriptEntry["planItems"];
  } = {}): void {
    if (!text) {
      return;
    }
    this.setState(appendTranscriptEntry(this.state, {
      role,
      text,
      planItems: options.planItems,
    }, this.viewport, this.projectionOptions()));
  }

  appendStreaming(role: Extract<TuiTranscriptRole, "assistant" | "reasoning">, text: string): void {
    if (!text) {
      return;
    }
    if (this.disposed) {
      return;
    }
    this.setState(appendTranscriptText(this.state, role, text, this.viewport, this.projectionOptions()));
  }

  appendOutput(text: string, role: TuiTranscriptRole = "system"): void {
    const submitted = parseSubmittedInputEcho(text);
    if (submitted !== undefined) {
      this.append("user", submitted);
      return;
    }
    this.append(role, text);
  }

  updateDock(dock: Partial<TuiRuntimeDockState>): void {
    this.setState(updateRuntimeDock(this.state, dock));
  }

  updateSessionFacts(session: SessionRecord): void {
    this.updateDock({
      context: formatContextBudget(session),
    });
  }

  updateComposerVisibleRows(visibleRows: number): void {
    const normalized = Math.max(1, Math.floor(visibleRows));
    if (this.state.composer.visibleRows === normalized) {
      return;
    }
    this.setState(updateComposerState(this.state, {
      visibleRows: normalized,
    }));
  }

  scrollBy(delta: number): void {
    this.setState(scrollTuiTranscript(this.state, this.viewport, delta, this.projectionOptions()));
  }

  pageUp(): void {
    this.scrollBy(-Math.max(1, this.viewport.height - 2));
  }

  pageDown(): void {
    this.scrollBy(Math.max(1, this.viewport.height - 2));
  }

  scrollTop(): void {
    this.setState(scrollTuiTranscriptToTop(this.state, this.viewport, this.projectionOptions()));
  }

  scrollBottom(): void {
    this.setState(scrollTuiTranscriptToBottom(this.state, this.viewport, this.projectionOptions()));
  }

  getVisibleTranscriptLineViews(viewport: TuiViewport): TuiSelectableTranscriptLineView[] {
    if (!this.state.selection.anchor || !this.state.selection.focus) {
      return this.projection.renderVisibleLineViews(this.state.transcript, viewport, this.state.scroll.offset);
    }
    return projectSelectedLineViews(this.renderAllTranscriptRows(), this.state.selection)
      .slice(this.state.scroll.offset, this.state.scroll.offset + viewport.height);
  }

  switchSession(session: SessionRecord): void {
    this.sessionId = session.id;
    const model = this.state.dock.model;
    this.state = createInitialTuiState(session, this.state.locale);
    if (model) this.state = updateRuntimeDock(this.state, { model });
    const restoredDraft = this.options.draftStore?.load(session.id);
    if (restoredDraft) {
      this.state = updateComposerState(this.state, {
        cursor: Math.max(0, Math.min(restoredDraft.cursor, restoredDraft.value.length)),
        value: restoredDraft.value,
      });
    }
    this.state = applyViewportResize(this.state, this.viewport, this.projectionOptions());
    this.setState(this.state);
  }

  handleMouseEvent(event: TuiMouseEvent): void {
    if (event.kind === "wheel") {
      this.scrollBy(event.delta);
      return;
    }
    if (this.state.overlay.kind !== "closed") return;
    this.selectionPointer = { x: event.x, y: event.y };
    if (event.kind === "press") {
      this.stopSelectionAutoScroll();
      const point = this.resolveSelectionPoint(event.x, event.y);
      if (!point) {
        this.clearSelection();
        return;
      }
      this.setState(updateSelectionState(this.state, {
        anchor: point,
        focus: point,
        dragging: true,
      }));
      return;
    }
    if (event.kind === "drag") {
      if (!this.state.selection.dragging) return;
      this.updateSelectionFocus(event.x, event.y);
      this.updateSelectionAutoScroll(event.y);
      return;
    }
    if (!this.state.selection.dragging) return;
    this.updateSelectionFocus(event.x, event.y);
    this.stopSelectionAutoScroll();
    this.setState(updateSelectionState(this.state, {
      ...this.state.selection,
      dragging: false,
    }));
  }

  clearSelection(): boolean {
    if (!this.state.selection.anchor && !this.state.selection.focus) return false;
    this.stopSelectionAutoScroll();
    this.setState(updateSelectionState(this.state, { dragging: false }));
    return true;
  }

  copySelection(): boolean {
    const text = readSelectedText(this.renderAllTranscriptRows(), this.state.selection);
    if (!text) return false;
    const writeClipboard = this.options.writeClipboard;
    if (!writeClipboard) {
      this.append("system", translate(this.state.locale, "tui.copyUnavailable"));
      return true;
    }
    void writeClipboard(text).then(
      () => {
        this.clearSelection();
        this.append("system", translate(this.state.locale, "tui.copySuccess"));
      },
      (error) => this.append("system", translate(this.state.locale, "tui.copyFailed", {
        error: error instanceof Error ? error.message : String(error),
      })),
    );
    return true;
  }

  dispose(): void {
    this.stopSelectionAutoScroll();
    this.disposed = true;
    this.queuedInputs = [];
    this.closeInput();
    this.listeners.clear();
  }

  private openInput(promptLabel: string): Promise<TuiInputResult> {
    if (this.disposed) {
      return Promise.resolve({ kind: "closed" });
    }
    this.closeInput();
    this.setState(updateComposerState(this.state, {
      promptLabel,
    }));
    const queued = this.queuedInputs.shift();
    if (queued !== undefined) {
      return Promise.resolve({ kind: "submit", value: queued });
    }
    return new Promise((resolve) => {
      this.pendingInput = {
        resolve,
      };
    });
  }

  private persistComposerDraft(): void {
    if (!this.sessionId) return;
    this.options.draftStore?.save(this.sessionId, {
      cursor: this.state.composer.cursor,
      value: this.state.composer.value,
    });
  }

  private setState(state: TuiState): void {
    if (this.disposed) {
      return;
    }
    this.state = state;
    this.projection.purge(this.state.transcript);
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private projectionOptions(): { projection: TuiTranscriptProjection } {
    return { projection: this.projection };
  }

  private renderAllTranscriptRows(): TuiTranscriptLineView[] {
    return this.projection.renderLineViews(this.state.transcript, this.viewport.width);
  }

  private resolveSelectionPoint(x: number, y: number) {
    return projectMouseSelectionPoint({
      rows: this.renderAllTranscriptRows(),
      scrollOffset: this.state.scroll.offset,
      viewport: this.viewport,
      x,
      y,
    });
  }

  private updateSelectionFocus(x: number, y: number): void {
    const focus = this.resolveSelectionPoint(x, y);
    if (!focus || !this.state.selection.anchor) return;
    this.setState(updateSelectionState(this.state, {
      ...this.state.selection,
      focus,
      dragging: true,
    }));
  }

  private updateSelectionAutoScroll(y: number): void {
    const direction = y <= 1 ? -1 : y >= this.viewport.height ? 1 : 0;
    if (direction === 0) {
      this.stopSelectionAutoScroll();
      return;
    }
    if (this.selectionAutoScrollTimer && this.selectionAutoScrollDirection === direction) return;
    this.stopSelectionAutoScroll();
    this.selectionAutoScrollDirection = direction;
    this.selectionAutoScrollTimer = setInterval(() => {
      if (!this.state.selection.dragging || !this.selectionPointer) {
        this.stopSelectionAutoScroll();
        return;
      }
      this.scrollBy(direction);
      this.updateSelectionFocus(this.selectionPointer.x, this.selectionPointer.y);
    }, 60);
    this.selectionAutoScrollTimer.unref();
  }

  private stopSelectionAutoScroll(): void {
    if (this.selectionAutoScrollTimer) clearInterval(this.selectionAutoScrollTimer);
    this.selectionAutoScrollTimer = undefined;
    this.selectionAutoScrollDirection = 0;
  }
}

function appendInputHistory(history: readonly string[], value: string): string[] {
  if (history.at(-1) === value) {
    return [...history];
  }
  return [...history, value];
}
