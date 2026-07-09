import type { SessionRecord } from "../../types.js";
import {
  appendTranscriptEntry,
  appendTranscriptText,
  applyViewportResize,
  parseSubmittedInputEcho,
  scrollTuiTranscript,
  scrollTuiTranscriptToBottom,
  scrollTuiTranscriptToTop,
  updateComposerState,
  updateRuntimeDock,
  createInitialTuiState,
  formatContextBudget,
  type TuiTranscriptLineView,
  type TuiRuntimeDockState,
  type TuiState,
  type TuiTranscriptRole,
  type TuiViewport,
} from "./store.js";
import { TuiTranscriptProjection } from "./transcriptProjection.js";

export type TuiStateListener = (state: TuiState) => void;

export type TuiInputResult =
  | { kind: "submit"; value: string }
  | { kind: "closed" };

interface PendingInput {
  resolve: (result: TuiInputResult) => void;
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

  constructor(session?: SessionRecord) {
    this.state = createInitialTuiState(session);
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

  submitInput(value: string): void {
    if (this.disposed) {
      return;
    }
    const pending = this.pendingInput;
    if (!pending) {
      this.queuedInputs.push(value);
      return;
    }
    this.pendingInput = null;
    this.setState(updateComposerState(this.state, {
      promptLabel: "> ",
    }));
    pending.resolve({ kind: "submit", value });
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

  append(role: TuiTranscriptRole, text: string): void {
    if (!text) {
      return;
    }
    this.setState(appendTranscriptEntry(this.state, { role, text }, this.viewport, this.projectionOptions()));
  }

  appendStreaming(role: Extract<TuiTranscriptRole, "assistant" | "reasoning" | "subagent" | "subagent_reasoning">, text: string): void {
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
    this.setState(scrollTuiTranscriptToTop(this.state));
  }

  scrollBottom(): void {
    this.setState(scrollTuiTranscriptToBottom(this.state, this.viewport, this.projectionOptions()));
  }

  getVisibleTranscriptLineViews(viewport: TuiViewport): TuiTranscriptLineView[] {
    return this.projection.renderVisibleLineViews(this.state.transcript, viewport, this.state.scroll.offset);
  }

  dispose(): void {
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
}
