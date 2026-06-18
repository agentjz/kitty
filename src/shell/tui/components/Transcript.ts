import {
  renderTranscriptLineViews,
  type TuiState,
  type TuiTranscriptLineView,
  type TuiViewport,
} from "../store.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";

export function createTranscriptComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function Transcript(props: {
    state: TuiState;
    viewport: TuiViewport;
  }): React.ReactNode {
    const rows = renderTranscriptLineViews(props.state.transcript, props.viewport.width)
      .slice(props.state.scroll.offset, props.state.scroll.offset + props.viewport.height);
    return React.createElement(
      Box,
      {
        flexDirection: "column",
        width: "100%",
        height: props.viewport.height,
        overflow: "hidden",
        backgroundColor: TUI_COLORS.background,
        paddingX: 3,
      },
      ...rows.map((row) => renderTranscriptLine(React, Box, Text, row)),
      props.state.scroll.newContentPending
        ? React.createElement(Text, { color: TUI_COLORS.warning }, "有新内容，按 End 回到底部")
        : null,
    );
  };
}

function renderTranscriptLine(
  React: InkRuntime["React"],
  Box: typeof import("ink").Box,
  Text: typeof import("ink").Text,
  row: TuiTranscriptLineView,
): React.ReactNode {
  if (row.kind === "spacer") {
    return React.createElement(Box, { key: row.id, height: 1 });
  }

  const style = readRoleStyle(row);
  return React.createElement(
    Box,
    {
      key: row.id,
      flexDirection: "row",
      width: "100%",
      backgroundColor: style.background,
      paddingX: style.paddingX,
      paddingY: style.paddingY,
      marginLeft: style.marginLeft,
    },
    React.createElement(Text, { color: style.accent }, style.gutter),
    React.createElement(
      Box,
      { flexGrow: 1, marginLeft: 2 },
      row.role === "reasoning" && row.isFirstContentLine
        ? React.createElement(
          Text,
          { color: TUI_COLORS.reasoning },
          React.createElement(Text, { color: TUI_COLORS.thought, italic: true }, "Thinking: "),
          row.text,
        )
        : React.createElement(Text, { color: style.text, bold: row.role === "user" }, row.text),
    ),
  );
}

function readRoleStyle(row: TuiTranscriptLineView): {
  accent: string;
  background: string | undefined;
  gutter: string;
  marginLeft: number;
  paddingX: number;
  paddingY: number;
  text: string;
} {
  switch (row.role) {
    case "user":
      return {
        accent: TUI_COLORS.user,
        background: TUI_COLORS.panelStrong,
        gutter: "┃",
        marginLeft: 1,
        paddingX: 1,
        paddingY: row.isFirstContentLine ? 1 : 0,
        text: TUI_COLORS.text,
      };
    case "reasoning":
      return {
        accent: TUI_COLORS.border,
        background: undefined,
        gutter: "┃",
        marginLeft: 1,
        paddingX: 1,
        paddingY: 0,
        text: TUI_COLORS.reasoning,
      };
    case "system":
      return {
        accent: TUI_COLORS.border,
        background: TUI_COLORS.panel,
        gutter: "│",
        marginLeft: 2,
        paddingX: 1,
        paddingY: row.isFirstContentLine ? 1 : 0,
        text: TUI_COLORS.system,
      };
    case "assistant":
      return {
        accent: TUI_COLORS.background,
        background: undefined,
        gutter: " ",
        marginLeft: 2,
        paddingX: 1,
        paddingY: 0,
        text: TUI_COLORS.assistant,
      };
  }
}
