import type { TuiController } from "../controller.js";
import type { TuiState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import { applyComposerInput } from "../composerEditing.js";
import {
  COMPOSER_FRAME,
  layoutComposer,
  measureComposerContentWidth,
  type ComposerFrameMetrics,
} from "../composerLayout.js";
import { measureAbsoluteBox } from "../inkGeometry.js";
import type { InkRuntime } from "./kit.js";

export function createComposerComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text" | "useCursor" | "useInput">) {
  const { React, Box, Text, useCursor, useInput } = kit;
  return function Composer(props: {
    controller: TuiController;
    frame: ComposerFrameMetrics;
    state: TuiState;
  }): React.ReactNode {
    const [draft, setDraft] = React.useState({ cursor: 0, value: "" });
    const contentRef = React.useRef<import("ink").DOMElement | null>(null);
    const cursorRowRef = React.useRef<import("ink").DOMElement | null>(null);
    const [measuredFrame, setMeasuredFrame] = React.useState<ComposerFrameMetrics>({
      hasMeasured: false,
      left: 0,
      top: 0,
      width: props.frame.width,
    });
    const [measuredCursorRow, setMeasuredCursorRow] = React.useState<ComposerFrameMetrics>({
      hasMeasured: false,
      left: 0,
      top: 0,
      width: props.frame.width,
    });

    React.useEffect(() => {
      const next = measureAbsoluteBox(contentRef.current);
      setMeasuredFrame((previous) => (
        previous.hasMeasured === next.hasMeasured
          && previous.left === next.left
          && previous.top === next.top
          && previous.width === next.width
          ? previous
          : next
      ));
      const nextCursorRow = measureAbsoluteBox(cursorRowRef.current);
      setMeasuredCursorRow((previous) => (
        previous.hasMeasured === nextCursorRow.hasMeasured
          && previous.left === nextCursorRow.left
          && previous.top === nextCursorRow.top
          && previous.width === nextCursorRow.width
          ? previous
          : nextCursorRow
      ));
    });

    const contentWidth = measuredFrame.hasMeasured
      ? measuredFrame.width
      : measureComposerContentWidth(props.frame.width);
    const layout = layoutComposer({
      contentWidth,
      cursor: draft.cursor,
      frame: measuredFrame.hasMeasured ? measuredFrame : props.frame,
      value: draft.value,
    });
    const { setCursorPosition } = useCursor();
    const cursorPosition = layout.cursorCell && measuredCursorRow.hasMeasured
      ? {
        x: measuredCursorRow.left + layout.cursorCell.x,
        y: measuredCursorRow.top,
      }
      : layout.cursor;

    React.useEffect(() => {
      props.controller.updateComposerVisibleRows(layout.visibleRows);
    }, [props.controller, layout.visibleRows]);

    setCursorPosition(cursorPosition);

    useInput((input, key) => {
      const action = applyComposerInput(draft, input, key);
      setDraft(action.state);
      if (action.kind === "submit") {
        props.controller.submitInput(action.value);
      }
    });

    return React.createElement(
      Box,
      {
        flexDirection: "row",
        backgroundColor: TUI_COLORS.panelStrong,
        paddingX: COMPOSER_FRAME.paddingX,
        paddingY: COMPOSER_FRAME.paddingY,
        minHeight: 3,
        width: "100%",
      },
      React.createElement(Text, { color: TUI_COLORS.user, wrap: "truncate-end" }, COMPOSER_FRAME.gutter),
      React.createElement(
        Box,
        {
          flexDirection: "column",
          ref: contentRef,
          width: layout.contentWidth,
          marginLeft: COMPOSER_FRAME.gap,
        },
        ...(draft.value
          ? layout.rows.map((row, index) => React.createElement(
            Box,
            {
              key: index,
              ref: layout.cursorCell?.y === index ? cursorRowRef : undefined,
              height: 1,
              width: layout.contentWidth,
            },
            React.createElement(
              Text,
              { color: TUI_COLORS.text, wrap: "truncate-end" },
              row || " ",
            ),
          ))
          : [React.createElement(
            Box,
            {
              key: "placeholder",
              ref: cursorRowRef,
              height: 1,
              width: layout.contentWidth,
            },
            React.createElement(
              Text,
              { color: TUI_COLORS.muted, wrap: "truncate-end" },
              "输入消息",
            ),
          )]),
      ),
    );
  };
}
