import { renderKittyAgentWordmark } from "../../banner.js";
import packageJson from "../../../../package.json";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";

export function createWelcomeWordmarkComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  const wordmark = renderKittyAgentWordmark();

  return function WelcomeWordmark(props: { compact?: boolean }): React.ReactNode {
    if (props.compact) {
      return React.createElement(
        Box,
        { alignSelf: "center", flexDirection: "row", gap: 1 },
        React.createElement(Text, { color: TUI_COLORS.text, bold: true }, "kitty agent"),
        React.createElement(Text, { color: TUI_COLORS.muted }, `v${packageJson.version}`),
      );
    }

    return React.createElement(
      Box,
      { alignSelf: "center", alignItems: "flex-end", flexDirection: "row", gap: 2 },
      React.createElement(Text, { color: TUI_COLORS.brand }, wordmark.kitty),
      React.createElement(Text, { color: TUI_COLORS.brand }, wordmark.agent),
      React.createElement(Text, { color: TUI_COLORS.muted }, `v${packageJson.version}`),
    );
  };
}
