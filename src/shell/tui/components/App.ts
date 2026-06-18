import type { TuiController } from "../controller.js";
import {
  measureTuiFooterRows,
  TUI_DOCK_ROWS,
  TUI_FOOTER_BORDER_TOP_ROWS,
  TUI_FOOTER_PADDING_BOTTOM_ROWS,
  TUI_FOOTER_PADDING_X,
  TUI_MIN_HEIGHT,
  TUI_MIN_WIDTH,
} from "../layout.js";
import type { TuiState, TuiViewport } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";
import { createComposerComponent } from "./Composer.js";
import { createRuntimeDockComponent } from "./RuntimeDock.js";
import { createTranscriptComponent } from "./Transcript.js";

export function createTuiAppComponent(kit: InkRuntime) {
  const { React, Box, useInput, useStdout } = kit;
  const Composer = createComposerComponent(kit);
  const RuntimeDock = createRuntimeDockComponent(kit);
  const Transcript = createTranscriptComponent(kit);

  return function TuiApp(props: {
    controller: TuiController;
    enableMouseTracking: () => () => void;
  }): React.ReactNode {
    const state = useTuiState(React, props.controller);
    const { stdout } = useStdout();
    const width = Math.max(TUI_MIN_WIDTH, stdout.columns ?? 80);
    const height = Math.max(TUI_MIN_HEIGHT, stdout.rows ?? 24);
    const footerRows = measureTuiFooterRows(state.composer.visibleRows);
    const transcriptViewport = React.useMemo<TuiViewport>(() => ({
      width,
      height: Math.max(1, height - footerRows),
    }), [footerRows, height, width]);
    const composerFrame = React.useMemo(() => ({
      hasMeasured: false,
      left: 0,
      top: 0,
      width: Math.max(1, width - TUI_FOOTER_PADDING_X * 2),
    }), [transcriptViewport.height, width]);

    React.useEffect(() => {
      props.controller.setViewport(transcriptViewport);
    }, [props.controller, transcriptViewport]);

    React.useEffect(() => {
      const disableMouse = props.enableMouseTracking();
      return () => {
        disableMouse();
      };
    }, [props.enableMouseTracking]);

    useInput((input, key) => {
      if (key.ctrl && input === "c") {
        props.controller.interrupt();
      } else if (key.pageUp) {
        props.controller.pageUp();
      } else if (key.pageDown) {
        props.controller.pageDown();
      } else if (key.home) {
        props.controller.scrollTop();
      } else if (key.end) {
        props.controller.scrollBottom();
      }
    });

    return React.createElement(
      Box,
      { flexDirection: "column", width, height },
      React.createElement(Transcript, { state, viewport: transcriptViewport }),
      React.createElement(
        Box,
        {
          flexDirection: "column",
          borderStyle: "single",
          borderTop: true,
          borderBottom: false,
          borderLeft: false,
          borderRight: false,
          borderColor: TUI_COLORS.border,
          backgroundColor: TUI_COLORS.panel,
          paddingX: TUI_FOOTER_PADDING_X,
          paddingBottom: TUI_FOOTER_PADDING_BOTTOM_ROWS,
          width: "100%",
        },
        React.createElement(RuntimeDock, { dock: state.dock }),
        React.createElement(Composer, {
          controller: props.controller,
          frame: composerFrame,
          state,
        }),
      ),
    );
  };
}

function useTuiState(React: InkRuntime["React"], controller: TuiController): TuiState {
  return React.useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
    () => controller.getState(),
  );
}
