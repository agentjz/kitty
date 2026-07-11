import type { TuiRuntimeDockState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";

export function createFooterMetaComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function FooterMeta(props: {
    dock: TuiRuntimeDockState;
  }): React.ReactNode {
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
        { color: TUI_COLORS.text, wrap: "truncate-end" },
        props.dock.model ? `模型 ${props.dock.model}` : "",
      ),
      React.createElement(
        Box,
        { flexDirection: "row", flexShrink: 1 },
        React.createElement(
          Text,
          { color: TUI_COLORS.text, wrap: "truncate-end" },
          `上下文 ${props.dock.context}`,
        ),
      ),
    );
  };
}
