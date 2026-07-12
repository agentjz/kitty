import type { TuiController } from "../controller.js";
import {
  measureTuiFooterRows,
  TUI_COMPOSER_META_GAP_ROWS,
  TUI_DOCK_COMPOSER_GAP_ROWS,
  TUI_FOOTER_CONTENT_INSET_X,
  TUI_FOOTER_PADDING_BOTTOM_ROWS,
  TUI_FOOTER_TOP_GAP_ROWS,
  TUI_MIN_HEIGHT,
  TUI_MIN_WIDTH,
} from "../layout.js";
import { hasTuiConversation, type TuiState, type TuiViewport } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import type { InkRuntime } from "./kit.js";
import { createComposerComponent } from "./Composer.js";
import { createTuiOverlayComponent } from "./Overlay.js";
import { measureTuiOverlayRows } from "../overlayLayout.js";
import { createFooterMetaComponent } from "./FooterMeta.js";
import { createRuntimeDockComponent } from "./RuntimeDock.js";
import { createTranscriptComponent } from "./Transcript.js";
import { createWelcomeWordmarkComponent } from "./WelcomeWordmark.js";
import { createWelcomeTipComponent } from "./WelcomeTip.js";

export function createTuiAppComponent(kit: InkRuntime) {
  const { React, Box, useStdout } = kit;
  const Composer = createComposerComponent(kit);
  const TuiOverlay = createTuiOverlayComponent(kit);
  const FooterMeta = createFooterMetaComponent(kit);
  const RuntimeDock = createRuntimeDockComponent(kit);
  const Transcript = createTranscriptComponent(kit);
  const WelcomeWordmark = createWelcomeWordmarkComponent(kit);
  const WelcomeTip = createWelcomeTipComponent(kit);

  return function TuiApp(props: {
    controller: TuiController;
    editExternally: (value: string) => Promise<string>;
    enableMouseTracking: () => () => void;
    redraw: () => void;
    suspendInput: () => () => void;
  }): React.ReactNode {
    const state = useTuiState(React, props.controller);
    const { stdout } = useStdout();
    const width = Math.max(TUI_MIN_WIDTH, stdout.columns ?? 80);
    const height = Math.max(TUI_MIN_HEIGHT, stdout.rows ?? 24);
    const welcome = !hasTuiConversation(state);
    const welcomeWidth = Math.max(40, Math.min(76, width - 8));
    const overlayMaxRows = Math.max(
      3,
      Math.min(10, height - measureTuiFooterRows(state.composer.visibleRows) - 1),
    );
    const overlayRows = measureTuiOverlayRows(state, overlayMaxRows);
    const footerRows = measureTuiFooterRows(state.composer.visibleRows, overlayRows > 0 ? overlayRows + 1 : 0);
    const transcriptViewport = React.useMemo<TuiViewport>(() => ({
      width,
      height: Math.max(1, height - footerRows),
    }), [footerRows, height, width]);
    const composerFrame = React.useMemo(() => ({
      hasMeasured: false,
      left: 0,
      top: 0,
      width: Math.max(1, (welcome ? welcomeWidth : width) - TUI_FOOTER_CONTENT_INSET_X * 2),
    }), [transcriptViewport.height, welcome, welcomeWidth, width]);

    React.useEffect(() => {
      props.controller.setViewport(transcriptViewport);
    }, [props.controller, transcriptViewport]);

    React.useEffect(() => {
      const disableMouse = props.enableMouseTracking();
      return () => {
        disableMouse();
      };
    }, [props.enableMouseTracking]);

    if (welcome) {
      return React.createElement(
        Box,
        {
          flexDirection: "column",
          width,
          height,
          backgroundColor: TUI_COLORS.background,
        },
        React.createElement(Box, { flexGrow: 1, minHeight: 1 }),
        React.createElement(
          Box,
          { flexDirection: "column", alignItems: "center", width: "100%" },
          React.createElement(WelcomeWordmark, {}),
          React.createElement(Box, { height: 1 }),
          React.createElement(
            Box,
            { width: welcomeWidth, paddingX: TUI_FOOTER_CONTENT_INSET_X },
            React.createElement(WelcomeTip, { locale: state.locale }),
          ),
          React.createElement(Box, { height: 1 }),
          React.createElement(
            Box,
            {
              flexDirection: "column",
              backgroundColor: TUI_COLORS.background,
              paddingX: TUI_FOOTER_CONTENT_INSET_X,
              paddingBottom: TUI_FOOTER_PADDING_BOTTOM_ROWS,
              width: welcomeWidth,
            },
            ...(state.overlay.kind === "closed" ? [] : [
              React.createElement(TuiOverlay, {
                key: "commands",
                maxRows: overlayMaxRows,
                state,
              }),
              React.createElement(Box, { key: "commands-gap", height: 1 }),
            ]),
            React.createElement(Composer, {
              controller: props.controller,
              editExternally: props.editExternally,
              frame: composerFrame,
              redraw: props.redraw,
              state,
              suspendInput: props.suspendInput,
            }),
            React.createElement(Box, { height: TUI_COMPOSER_META_GAP_ROWS }),
            React.createElement(FooterMeta, { dock: state.dock, locale: state.locale }),
          ),
        ),
        React.createElement(Box, { flexGrow: 1, minHeight: 1 }),
      );
    }

    return React.createElement(
      Box,
      { flexDirection: "column", width, height },
      React.createElement(Transcript, { controller: props.controller, state, viewport: transcriptViewport }),
      React.createElement(Box, {
        backgroundColor: TUI_COLORS.background,
        height: TUI_FOOTER_TOP_GAP_ROWS,
        width: "100%",
      }),
      React.createElement(
        Box,
        {
          flexDirection: "column",
          backgroundColor: TUI_COLORS.background,
          paddingX: TUI_FOOTER_CONTENT_INSET_X,
          paddingBottom: TUI_FOOTER_PADDING_BOTTOM_ROWS,
          width: "100%",
        },
        React.createElement(RuntimeDock, { dock: state.dock, locale: state.locale }),
        React.createElement(Box, { height: TUI_DOCK_COMPOSER_GAP_ROWS }),
        ...(state.overlay.kind === "closed" ? [] : [
          React.createElement(TuiOverlay, {
            key: "commands",
            maxRows: overlayMaxRows,
            state,
          }),
          React.createElement(Box, { key: "commands-gap", height: 1 }),
        ]),
        React.createElement(Composer, {
          controller: props.controller,
          editExternally: props.editExternally,
          frame: composerFrame,
          redraw: props.redraw,
          state,
          suspendInput: props.suspendInput,
        }),
        React.createElement(Box, { height: TUI_COMPOSER_META_GAP_ROWS }),
        React.createElement(FooterMeta, { dock: state.dock, locale: state.locale }),
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
