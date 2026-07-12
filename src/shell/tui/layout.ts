export const TUI_MIN_WIDTH = 48;
export const TUI_MIN_HEIGHT = 14;
export const TUI_DOCK_ROWS = 1;
export const TUI_COMPOSER_MAX_ROWS = 6;
export const TUI_FOOTER_TOP_GAP_ROWS = 2;
export const TUI_DOCK_COMPOSER_GAP_ROWS = 1;
export const TUI_COMPOSER_META_GAP_ROWS = 1;
export const TUI_FOOTER_CONTENT_INSET_X = 2;
export const TUI_FOOTER_PADDING_BOTTOM_ROWS = 1;
export const TUI_FOOTER_META_ROWS = 1;

const COMPOSER_VERTICAL_PADDING_ROWS = 2;

export function measureTuiFooterRows(composerRows: number, commandMenuRows = 0): number {
  return TUI_FOOTER_TOP_GAP_ROWS
    + TUI_DOCK_ROWS
    + TUI_DOCK_COMPOSER_GAP_ROWS
    + COMPOSER_VERTICAL_PADDING_ROWS
    + normalizeComposerRows(composerRows)
    + TUI_COMPOSER_META_GAP_ROWS
    + TUI_FOOTER_META_ROWS
    + TUI_FOOTER_PADDING_BOTTOM_ROWS
    + normalizeCommandMenuRows(commandMenuRows);
}

export function normalizeComposerRows(rows: number): number {
  return Math.max(1, Math.min(TUI_COMPOSER_MAX_ROWS, Math.floor(rows)));
}

function normalizeCommandMenuRows(rows: number): number {
  return Math.max(0, Math.floor(rows));
}
