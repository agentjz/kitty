import type { TuiController } from "../controller.js";
import type { TuiState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import {
  COMPOSER_FRAME,
  layoutComposer,
  measureComposerContentWidth,
  type ComposerFrameMetrics,
} from "../composerLayout.js";
import { measureAbsoluteBox } from "../inkGeometry.js";
import type { InkRuntime } from "./kit.js";
import { translate } from "../../../i18n/index.js";

export function createComposerComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text" | "useCursor" | "useInput" | "usePaste" | "useStdin">) {
  const { React, Box, Text, useCursor, useInput, usePaste, useStdin } = kit;
  return function Composer(props: {
    controller: TuiController;
    editExternally: (value: string) => Promise<string>;
    frame: ComposerFrameMetrics;
    redraw: () => void;
    state: TuiState;
    suspendInput: () => () => void;
  }): React.ReactNode {
    const draft = props.state.composer;
    const contentRef = React.useRef<import("ink").DOMElement | null>(null);
    const [measuredFrame, setMeasuredFrame] = React.useState<ComposerFrameMetrics>({
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
    const { isRawModeSupported, setRawMode } = useStdin();

    React.useEffect(() => {
      props.controller.updateComposerVisibleRows(layout.visibleRows);
    }, [props.controller, layout.visibleRows]);

    setCursorPosition(layout.cursor);

    usePaste((text) => {
      props.controller.handleComposerPaste(text);
    });

    useInput((input, key) => {
      if (key.ctrl && input.toLowerCase() === "c") {
        if (props.controller.copySelection()) return;
        props.controller.interrupt();
        return;
      }
      if (key.escape && props.controller.clearSelection()) return;
      if (key.pageUp) {
        props.controller.pageUp();
        return;
      }
      if (key.pageDown) {
        props.controller.pageDown();
        return;
      }
      if (key.ctrl && key.home) props.controller.scrollTop();
      if (key.ctrl && key.end) props.controller.scrollBottom();
      if (key.ctrl && input.toLowerCase() === "l") {
        props.redraw();
        return;
      }
      if (key.ctrl && input.toLowerCase() === "o") {
        props.controller.toggleLatestToolDetails();
        return;
      }
      if (key.ctrl && input.toLowerCase() === "g") {
        void props.controller.editComposerExternally(async (value) => {
          const resumeInput = props.suspendInput();
          if (isRawModeSupported) setRawMode(false);
          try {
            return await props.editExternally(value);
          } finally {
            resumeInput();
            if (isRawModeSupported) setRawMode(true);
          }
        });
        return;
      }
      props.controller.handleComposerInput(input, key);
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
              height: 1,
              width: layout.contentWidth,
            },
            React.createElement(
              Text,
              { color: TUI_COLORS.muted, wrap: "truncate-end" },
              props.state.composer.promptLabel === "> "
                ? translate(props.state.locale, "tui.inputPlaceholder")
                : props.state.composer.promptLabel.trim(),
            ),
          )]),
      ),
    );
  };
}
