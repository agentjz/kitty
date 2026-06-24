import type { TuiRuntimeDockState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import { TUI_DOCK_ROWS } from "../layout.js";
import type { InkRuntime } from "./kit.js";

export function createRuntimeDockComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function RuntimeDock(props: {
    dock: TuiRuntimeDockState;
  }): React.ReactNode {
    const facts: Array<{ label: string; value: string }> = [];
    if (props.dock.background) {
      facts.push({ label: "后台", value: props.dock.background });
    }
    if (props.dock.subagent) {
      facts.push({ label: "子代理", value: props.dock.subagent });
    }
    if (props.dock.context) {
      facts.push({ label: "上下文", value: props.dock.context });
    }

    return React.createElement(
      Box,
      {
        flexDirection: "column",
        width: "100%",
        height: TUI_DOCK_ROWS,
      },
      props.dock.current
        ? React.createElement(
          Box,
          { flexDirection: "row" },
          React.createElement(Text, { color: TUI_COLORS.user }, "▣ "),
          React.createElement(Text, { color: TUI_COLORS.text }, props.dock.current),
        )
        : React.createElement(
          Box,
          { flexDirection: "row", height: 1 },
          React.createElement(Text, { color: TUI_COLORS.muted }, "空闲中"),
        ),
      facts.length > 0
        ? React.createElement(
          Box,
          { height: 1, marginTop: 0 },
          ...facts.flatMap(({ label, value }, index) => [
            index > 0 ? React.createElement(Text, { color: TUI_COLORS.muted, key: `${label}-gap` }, "   ") : null,
            React.createElement(Text, { color: TUI_COLORS.muted, key: `${label}-label` }, `${label} `),
            React.createElement(Text, { color: readFactColor(value), key: `${label}-value` }, value),
          ]),
        )
        : React.createElement(
          Box,
          { marginTop: 0 },
        ),
    );
  };
}

function readFactColor(value: string): string {
  if (value.includes("失败") || value.includes("错误") || value.includes("卡住")) {
    return TUI_COLORS.error;
  }
  if (value.includes("运行") || value.includes("等待") || value.includes("执行")) {
    return TUI_COLORS.warning;
  }
  if (value.includes("完成")) {
    return TUI_COLORS.success;
  }
  return TUI_COLORS.muted;
}
