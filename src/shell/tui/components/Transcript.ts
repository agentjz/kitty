import {
  renderTranscriptLineViews,
  type TuiState,
  type TuiTranscriptLineView,
  type TuiViewport,
} from "../store.js";
import { TUI_COLORS } from "../theme.js";
import { TRANSCRIPT_OUTER_PADDING_X } from "../transcriptLayout.js";
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
        paddingX: TRANSCRIPT_OUTER_PADDING_X,
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

  return React.createElement(
    Box,
    {
      key: row.id,
      flexDirection: "row",
      width: "100%",
      height: 1,
      backgroundColor: row.style.background,
      marginLeft: row.frame.marginLeft,
      paddingLeft: row.frame.paddingLeft,
      paddingRight: row.frame.paddingRight,
    },
    React.createElement(Text, { color: row.style.accent, wrap: "truncate-end" }, row.frame.gutter),
    React.createElement(
      Box,
      { width: row.frame.bodyWidth, marginLeft: row.frame.gap },
      row.prefix
        ? React.createElement(
          Text,
          { color: row.style.text, wrap: "truncate-end" },
          React.createElement(Text, { color: TUI_COLORS.thought, italic: row.style.italicPrefix, wrap: "truncate-end" }, row.prefix),
          row.text,
        )
        : React.createElement(Text, {
          color: row.style.text,
          bold: row.style.bold,
          dimColor: row.style.dim,
          wrap: "truncate-end",
        }, row.text),
    ),
  );
}
