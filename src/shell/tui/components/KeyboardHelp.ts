import { getTuiShortcutHelp } from "../keyboardHelp.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";
import type { TuiOverlayState } from "../store.js";
import { translate, type KittyLocale } from "../../../i18n/index.js";

export function createKeyboardHelpComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function KeyboardHelp(props: {
    maxRows: number;
    locale: KittyLocale;
    overlay: Extract<TuiOverlayState, { kind: "keyboardHelp" }>;
  }): React.ReactNode {
    const allRows = getTuiShortcutHelp(props.locale).flatMap((group) => [
      { kind: "heading" as const, key: `heading:${group.title}`, left: group.title, right: "" },
      ...group.shortcuts.map((shortcut) => ({
        kind: "shortcut" as const,
        key: `${group.title}:${shortcut.keys}`,
        left: shortcut.keys,
        right: shortcut.action,
      })),
    ]);
    const bodyRows = Math.max(1, props.maxRows - 1);
    const start = Math.min(props.overlay.offset, Math.max(0, allRows.length - bodyRows));
    const rows = allRows.slice(start, start + bodyRows);
    return React.createElement(
      Box,
      { backgroundColor: TUI_COLORS.panel, flexDirection: "column", width: "100%" },
      ...rows.map((row) => React.createElement(
        Box,
        { key: row.key, flexDirection: "row", height: 1, paddingX: 1, width: "100%" },
        React.createElement(
          Text,
          { bold: row.kind === "heading", color: row.kind === "heading" ? TUI_COLORS.accentBlue : TUI_COLORS.text },
          row.left,
        ),
        React.createElement(Box, { flexGrow: 1, minWidth: 1 }),
        React.createElement(Text, { color: TUI_COLORS.muted, wrap: "truncate-end" }, row.right),
      )),
      React.createElement(
        Box,
        { height: 1, justifyContent: "flex-end", paddingX: 1, width: "100%" },
        React.createElement(Text, { color: TUI_COLORS.muted }, translate(props.locale, "tui.scrollHelp")),
      ),
    );
  };
}
