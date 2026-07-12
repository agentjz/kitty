import { filterTuiInputHistory } from "../historySearch.js";
import type { TuiComposerState, TuiOverlayState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";
import { translate, type KittyLocale } from "../../../i18n/index.js";

export function createHistorySearchComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function HistorySearch(props: {
    composer: TuiComposerState;
    locale: KittyLocale;
    maxRows: number;
    overlay: Extract<TuiOverlayState, { kind: "historySearch" }>;
  }): React.ReactNode {
    const items = filterTuiInputHistory(props.composer.history, props.overlay.query);
    const itemRows = Math.max(1, props.maxRows - 1);
    const selectedIndex = items.length === 0 ? 0 : Math.min(props.overlay.selectedIndex, items.length - 1);
    const startIndex = Math.max(0, Math.min(selectedIndex - itemRows + 1, items.length - itemRows));
    const visibleItems = items.slice(startIndex, startIndex + itemRows);
    return React.createElement(
      Box,
      { backgroundColor: TUI_COLORS.panel, flexDirection: "column", width: "100%" },
      React.createElement(
        Box,
        { height: 1, paddingX: 1 },
        React.createElement(Text, { color: TUI_COLORS.muted }, `${translate(props.locale, "tui.history")} `),
        React.createElement(Text, { color: TUI_COLORS.text, wrap: "truncate-end" }, props.overlay.query || translate(props.locale, "tui.historyPlaceholder")),
      ),
      ...(visibleItems.length === 0 ? [React.createElement(
        Box,
        { key: "empty", height: 1, paddingX: 1 },
        React.createElement(Text, { color: TUI_COLORS.muted }, translate(props.locale, "tui.historyNoMatches")),
      )] : visibleItems.map((item, rowIndex) => {
        const selected = startIndex + rowIndex === selectedIndex;
        return React.createElement(
          Box,
          {
            key: `${item.historyIndex}:${item.value}`,
            backgroundColor: selected ? TUI_COLORS.panelStrong : TUI_COLORS.panel,
            height: 1,
            paddingX: 1,
          },
          React.createElement(
            Text,
            { color: selected ? TUI_COLORS.accentGold : TUI_COLORS.text, wrap: "truncate-end" },
            `${selected ? ">" : " "} ${item.value.replace(/\s+/g, " ")}`,
          ),
        );
      })),
    );
  };
}
