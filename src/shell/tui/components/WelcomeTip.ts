import { translate, type KittyLocale } from "../../../i18n/index.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";

export function createWelcomeTipComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function WelcomeTip(props: { locale: KittyLocale }): React.ReactNode {
    return React.createElement(
      Box,
      { flexDirection: "row", height: 1, justifyContent: "center", overflowX: "hidden", width: "100%" },
      React.createElement(Text, { color: TUI_COLORS.accentGold, bold: true }, "猫咪："),
      React.createElement(Text, { color: TUI_COLORS.muted, wrap: "truncate-end" }, translate(props.locale, "tui.authorTip")),
    );
  };
}
