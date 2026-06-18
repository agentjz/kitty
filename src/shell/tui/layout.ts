export const TUI_MIN_WIDTH = 48;
export const TUI_MIN_HEIGHT = 14;
export const TUI_DOCK_ROWS = 2;
export const TUI_COMPOSER_MAX_ROWS = 6;

const FOOTER_BORDER_ROWS = 1;
const FOOTER_INNER_VERTICAL_PADDING_ROWS = 2;

export function measureTuiFooterRows(composerRows: number): number {
  return FOOTER_BORDER_ROWS + TUI_DOCK_ROWS + FOOTER_INNER_VERTICAL_PADDING_ROWS + normalizeComposerRows(composerRows);
}

export function normalizeComposerRows(rows: number): number {
  return Math.max(1, Math.min(TUI_COMPOSER_MAX_ROWS, Math.floor(rows)));
}
