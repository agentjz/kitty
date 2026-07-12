import type { TuiState } from "../store.js";
import type { InkRuntime } from "./kit.js";
import { createCommandMenuComponent } from "./CommandMenu.js";
import { createHistorySearchComponent } from "./HistorySearch.js";
import { createKeyboardHelpComponent } from "./KeyboardHelp.js";

export function createTuiOverlayComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const CommandMenu = createCommandMenuComponent(kit);
  const HistorySearch = createHistorySearchComponent(kit);
  const KeyboardHelp = createKeyboardHelpComponent(kit);
  return function TuiOverlay(props: { maxRows: number; state: TuiState }): React.ReactNode {
    const overlay = props.state.overlay;
    if (overlay.kind === "closed") return null;
    if (overlay.kind === "keyboardHelp") {
      return kit.React.createElement(KeyboardHelp, { locale: props.state.locale, maxRows: props.maxRows, overlay });
    }
    if (overlay.kind === "historySearch") {
      return kit.React.createElement(HistorySearch, {
        composer: props.state.composer,
        locale: props.state.locale,
        maxRows: props.maxRows,
        overlay,
      });
    }
    return kit.React.createElement(CommandMenu, { locale: props.state.locale, maxRows: props.maxRows, overlay });
  };
}
