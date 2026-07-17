import { renderKittyAgentWordmark } from "../../../runtime-ui/banner.js";
import packageJson from "../../../../package.json";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";

export function createWelcomeWordmarkComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  const wordmark = renderKittyAgentWordmark();

  return function WelcomeWordmark(props: { compact?: boolean }): React.ReactNode {
    return React.createElement(
      Box,
      { alignSelf: "center", alignItems: "flex-start", flexDirection: "column" },
      React.createElement(Text, { color: TUI_COLORS.muted }, `v${packageJson.version}`),
      props.compact ? null : React.createElement(Box, { height: 1 }),
      props.compact
        ? React.createElement(Text, { color: TUI_COLORS.brand, bold: true }, "kitty agent")
        : React.createElement(
          Box,
          { alignItems: "flex-end", flexDirection: "row", gap: 2 },
          React.createElement(Text, { color: TUI_COLORS.brand }, wordmark.kitty),
          React.createElement(Text, { color: TUI_COLORS.brand }, wordmark.agent),
        ),
    );
  };
}
