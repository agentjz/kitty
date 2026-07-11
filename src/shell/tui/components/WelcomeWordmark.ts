import { renderKittyAgentWordmark } from "../../banner.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";

export function createWelcomeWordmarkComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  const wordmark = renderKittyAgentWordmark();

  return function WelcomeWordmark(): React.ReactNode {
    return React.createElement(
      Box,
      { alignSelf: "center", flexDirection: "row", gap: 2 },
      React.createElement(Text, { color: TUI_COLORS.brand }, wordmark.kitty),
      React.createElement(Text, { color: TUI_COLORS.brand }, wordmark.agent),
    );
  };
}
