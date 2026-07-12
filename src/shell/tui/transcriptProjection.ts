import { TUI_COLORS } from "./theme.js";
import {
  renderTranscriptEntryLineViews,
  type TuiTranscriptEntry,
  type TuiTranscriptLineView,
  type TuiTranscriptTheme,
} from "./transcriptLayout.js";
import type { TuiViewport } from "./store.js";

export interface TuiTranscriptProjectionOptions {
  readonly onEntryLayout?: (entry: TuiTranscriptEntry, width: number) => void;
  readonly theme?: TuiTranscriptTheme;
}

interface CachedEntryRows {
  readonly signature: string;
  readonly rows: readonly TuiTranscriptLineView[];
}

export class TuiTranscriptProjection {
  private readonly cache = new Map<string, CachedEntryRows>();
  private readonly theme: TuiTranscriptTheme;
  private readonly onEntryLayout: ((entry: TuiTranscriptEntry, width: number) => void) | undefined;

  constructor(options: TuiTranscriptProjectionOptions = {}) {
    this.theme = options.theme ?? TUI_COLORS;
    this.onEntryLayout = options.onEntryLayout;
  }

  renderLineViews(entries: readonly TuiTranscriptEntry[], width: number): TuiTranscriptLineView[] {
    return entries.flatMap((entry) => this.renderEntry(entry, width));
  }

  renderVisibleLineViews(
    entries: readonly TuiTranscriptEntry[],
    viewport: TuiViewport,
    offset: number,
  ): TuiTranscriptLineView[] {
    const start = Math.max(0, Math.floor(offset));
    const end = start + Math.max(0, Math.floor(viewport.height));
    const rows: TuiTranscriptLineView[] = [];
    let cursor = 0;

    for (const entry of entries) {
      const entryRows = this.renderEntry(entry, viewport.width);
      const nextCursor = cursor + entryRows.length;
      if (nextCursor <= start) {
        cursor = nextCursor;
        continue;
      }
      if (cursor >= end) {
        break;
      }
      const from = Math.max(0, start - cursor);
      const to = Math.min(entryRows.length, end - cursor);
      rows.push(...entryRows.slice(from, to));
      cursor = nextCursor;
    }

    return rows;
  }

  measureRows(entries: readonly TuiTranscriptEntry[], width: number): number {
    let rows = 0;
    for (const entry of entries) {
      rows += this.renderEntry(entry, width).length;
    }
    return rows;
  }

  purge(entries: readonly TuiTranscriptEntry[]): void {
    const ids = new Set(entries.map((entry) => entry.id));
    for (const key of this.cache.keys()) {
      const id = key.slice(0, key.indexOf("\0"));
      if (!ids.has(id)) {
        this.cache.delete(key);
      }
    }
  }

  private renderEntry(entry: TuiTranscriptEntry, width: number): readonly TuiTranscriptLineView[] {
    const normalizedWidth = Math.max(1, Math.floor(width));
    const key = `${entry.id}\0${normalizedWidth}`;
    const planSignature = entry.planItems?.map((item) => `${item.id}:${item.status}:${item.text}`).join("\0") ?? "";
    const signature = `${entry.role}\0${entry.text}\0${entry.details ?? ""}\0${entry.expanded ? "1" : "0"}\0${planSignature}`;
    const cached = this.cache.get(key);
    if (cached?.signature === signature) {
      return cached.rows;
    }

    this.onEntryLayout?.(entry, normalizedWidth);
    const rows = renderTranscriptEntryLineViews(entry, normalizedWidth, this.theme);
    this.cache.set(key, { signature, rows });
    return rows;
  }
}
