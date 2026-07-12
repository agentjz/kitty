import { ControlPlaneLedger } from "../../control/ledger.js";
import type { TuiDraftStore } from "./controller.js";

const TUI_SHELL_NAME = "tui";
const DRAFT_RETRY_DELAY_MS = 50;

type PendingDraftWrite =
  | { kind: "clear"; sessionId: string }
  | { kind: "save"; sessionId: string; cursor: number; value: string };

export class SqliteTuiDraftStore implements TuiDraftStore {
  private readonly ledger: ControlPlaneLedger;
  private pending: PendingDraftWrite | undefined;
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(rootDir: string) {
    this.ledger = new ControlPlaneLedger(rootDir);
  }

  load(sessionId: string): { cursor: number; value: string } | undefined {
    const draft = this.ledger.interactionDrafts.load(sessionId, TUI_SHELL_NAME);
    return draft ? { cursor: draft.cursor, value: draft.value } : undefined;
  }

  save(sessionId: string, draft: { cursor: number; value: string }): void {
    if (this.disposed) return;
    this.pending = draft.value
      ? { kind: "save", sessionId, ...draft }
      : { kind: "clear", sessionId };
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.flushOrRetry();
  }

  clear(sessionId: string): boolean {
    this.pending = { kind: "clear", sessionId };
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    return this.flushOrRetry();
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const pending = this.pending;
    if (!pending) return;
    if (pending.kind === "clear") {
      this.ledger.interactionDrafts.delete(pending.sessionId, TUI_SHELL_NAME);
    } else {
      this.ledger.interactionDrafts.save({
        sessionId: pending.sessionId,
        cursor: pending.cursor,
        value: pending.value,
        shell: TUI_SHELL_NAME,
        updatedAt: new Date().toISOString(),
      });
    }
    if (this.pending === pending) this.pending = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.flush();
    } catch {
      // Cleanup cannot recover from an externally held SQLite write lock.
    } finally {
      this.ledger.close();
    }
  }

  private flushOrRetry(): boolean {
    try {
      this.flush();
      return true;
    } catch {
      if (this.disposed || this.timer) return false;
      this.timer = setTimeout(() => this.flushOrRetry(), DRAFT_RETRY_DELAY_MS);
      this.timer.unref?.();
      return false;
    }
  }
}
