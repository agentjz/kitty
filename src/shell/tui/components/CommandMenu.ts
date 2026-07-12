import { filterTuiCommandMenu, windowTuiCommandMenu } from "../commandMenu.js";
import type { TuiOverlayState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";
import { translate, type KittyLocale } from "../../../i18n/index.js";

export function createCommandMenuComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function CommandMenu(props: {
    maxRows: number;
    locale: KittyLocale;
    overlay: Extract<TuiOverlayState, { kind: "slashCommands" | "commandPalette" }>;
  }): React.ReactNode {
    const commands = filterTuiCommandMenu(props.overlay.query, props.locale);
    const palette = props.overlay.kind === "commandPalette";
    const menu = windowTuiCommandMenu(commands, props.overlay.selectedIndex, props.maxRows - (palette ? 1 : 0));

    return React.createElement(
      Box,
      {
        backgroundColor: TUI_COLORS.panel,
        flexDirection: "column",
        width: "100%",
      },
      ...(palette ? [React.createElement(
        Box,
        { key: "query", paddingX: 1, height: 1 },
        React.createElement(Text, { color: TUI_COLORS.muted, wrap: "truncate-end" }, `${translate(props.locale, "tui.commandQuery")} `),
        React.createElement(Text, { color: TUI_COLORS.text, wrap: "truncate-end" }, props.overlay.query || translate(props.locale, "tui.commandQueryPlaceholder")),
      )] : []),
      ...(menu.items.length === 0 ? [React.createElement(
        Box,
        { key: "empty", paddingX: 1, height: 1 },
        React.createElement(Text, { color: TUI_COLORS.muted }, translate(props.locale, "tui.commandNoMatches")),
      )] : menu.items.map((command, rowIndex) => {
        const absoluteIndex = menu.startIndex + rowIndex;
        const selected = absoluteIndex === menu.selectedIndex;
        const aliases = command.aliases.length > 0 ? `  ${command.aliases.join(", ")}` : "";
        return React.createElement(
          Box,
          {
            key: command.name,
            backgroundColor: selected ? TUI_COLORS.panelStrong : TUI_COLORS.panel,
            flexDirection: "row",
            height: 1,
            paddingX: 1,
            width: "100%",
          },
          React.createElement(
            Text,
            { color: selected ? TUI_COLORS.accentGold : TUI_COLORS.text, wrap: "truncate-end" },
            `${selected ? ">" : " "} ${command.name}${aliases}`,
          ),
          React.createElement(Box, { flexGrow: 1, minWidth: 1 }),
          React.createElement(
            Text,
            { color: TUI_COLORS.muted, wrap: "truncate-end" },
            `${command.description}${command.requiresConfirmation ? ` · ${translate(props.locale, "command.confirmation.required")}` : ""}`,
          ),
        );
      })),
    );
  };
}
