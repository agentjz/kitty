import type { TuiRuntimeDockState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";

export function createRuntimeDockComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function RuntimeDock(props: {
    dock: TuiRuntimeDockState;
  }): React.ReactNode {
    return React.createElement(
      Box,
      {
        flexDirection: "column",
        width: "100%",
      },
      React.createElement(
        Box,
        { flexDirection: "row" },
        props.dock.work.active
          ? React.createElement(Text, { color: TUI_COLORS.user }, "▣ ")
          : null,
        React.createElement(Text, { color: props.dock.work.active ? TUI_COLORS.user : TUI_COLORS.muted }, props.dock.work.label),
        React.createElement(Text, { color: TUI_COLORS.muted }, " · "),
        React.createElement(Text, { color: props.dock.work.active ? TUI_COLORS.text : TUI_COLORS.muted }, props.dock.work.detail),
      ),
      React.createElement(
        Box,
        { marginTop: 0 },
        null,
        React.createElement(Text, { color: TUI_COLORS.muted }, "后台任务 "),
        React.createElement(Text, { color: readFactColor(props.dock.background) }, props.dock.background),
        React.createElement(Text, { color: TUI_COLORS.muted }, "   "),
        React.createElement(Text, { color: TUI_COLORS.muted }, "子代理 "),
        React.createElement(Text, { color: readFactColor(props.dock.subagent) }, props.dock.subagent),
        React.createElement(Text, { color: TUI_COLORS.muted }, "   "),
        React.createElement(Text, { color: TUI_COLORS.muted }, "上下文 "),
        React.createElement(Text, { color: TUI_COLORS.text }, props.dock.context),
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
