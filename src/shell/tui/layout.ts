export const TUI_MIN_WIDTH = 48;
export const TUI_MIN_HEIGHT = 14;
export const TUI_DOCK_ROWS = 2;
export const TUI_COMPOSER_MAX_ROWS = 6;
export const TUI_FOOTER_BORDER_TOP_ROWS = 1;
export const TUI_FOOTER_PADDING_X = 2;
export const TUI_FOOTER_PADDING_BOTTOM_ROWS = 1;

const COMPOSER_VERTICAL_PADDING_ROWS = 2;

export function measureTuiFooterRows(composerRows: number): number {
  return TUI_FOOTER_BORDER_TOP_ROWS
    + TUI_DOCK_ROWS
    + COMPOSER_VERTICAL_PADDING_ROWS
    + normalizeComposerRows(composerRows)
    + TUI_FOOTER_PADDING_BOTTOM_ROWS;
}

export function normalizeComposerRows(rows: number): number {
  return Math.max(1, Math.min(TUI_COMPOSER_MAX_ROWS, Math.floor(rows)));
}
