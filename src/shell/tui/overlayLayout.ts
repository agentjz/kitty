import { filterTuiCommandMenu } from "./commandMenu.js";
import { filterTuiInputHistory } from "./historySearch.js";
import { countTuiShortcutHelpRows } from "./keyboardHelp.js";
import type { TuiState } from "./store.js";

export function measureTuiOverlayRows(state: TuiState, maxRows: number): number {
  const overlay = state.overlay;
  if (overlay.kind === "closed") return 0;
  if (overlay.kind === "keyboardHelp") {
    return Math.min(maxRows, countTuiShortcutHelpRows());
  }
  const itemCount = overlay.kind === "historySearch"
    ? filterTuiInputHistory(state.composer.history, overlay.query).length
    : filterTuiCommandMenu(overlay.query).length;
  const headerRows = overlay.kind === "slashCommands" ? 0 : 1;
  return headerRows + Math.min(Math.max(1, itemCount), Math.max(1, maxRows - headerRows));
}
