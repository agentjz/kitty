import type { TuiRuntimeDockState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../../../i18n/index.js";

export function createFooterMetaComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function FooterMeta(props: {
    dock: TuiRuntimeDockState;
    locale?: KittyLocale;
  }): React.ReactNode {
    const locale = props.locale ?? DEFAULT_LOCALE;
    return React.createElement(
      Box,
      {
        flexDirection: "row",
        height: 1,
        justifyContent: "space-between",
        width: "100%",
      },
      React.createElement(
        Text,
        { color: TUI_COLORS.muted, wrap: "truncate-end" },
        props.dock.model
          ? `${translate(locale, "tui.model")} ${props.dock.model}`
          : "",
      ),
      React.createElement(
        Box,
        { flexDirection: "row", flexShrink: 1 },
        React.createElement(
          Text,
          { color: TUI_COLORS.muted, wrap: "truncate-end" },
          `${translate(locale, "tui.context")} ${props.dock.context}`,
        ),
      ),
    );
  };
}
