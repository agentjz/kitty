import type { TuiController } from "../controller.js";
import type { TuiState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import { TUI_COMPOSER_MAX_ROWS, normalizeComposerRows } from "../layout.js";
import type { InkRuntime } from "./kit.js";

export function createComposerComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text" | "TextArea">) {
  const { React, Box, Text, TextArea } = kit;
  return function Composer(props: {
    controller: TuiController;
    state: TuiState;
  }): React.ReactNode {
    const [draft, setDraft] = React.useState("");
    const visibleRows = normalizeComposerRows(countLines(draft));

    React.useEffect(() => {
      props.controller.updateComposerVisibleRows(visibleRows);
    }, [props.controller, visibleRows]);

    return React.createElement(
      Box,
      {
        flexDirection: "row",
        backgroundColor: TUI_COLORS.panelStrong,
        paddingX: 2,
        paddingY: 1,
        minHeight: 3,
        width: "100%",
      },
      React.createElement(Text, { color: TUI_COLORS.user }, "┃"),
      React.createElement(
        Box,
        { flexDirection: "column", flexGrow: 1, marginLeft: 2 },
        React.createElement(TextArea, {
          focus: true,
          value: draft,
          onChange: setDraft,
          onSubmit: (value: string) => {
            setDraft("");
            props.controller.submitInput(value);
          },
          placeholder: "输入消息",
          initialLineCount: 1,
          viewportLines: TUI_COMPOSER_MAX_ROWS,
          tabWidth: 2,
          cursorInterval: 450,
          styles: {
            text: {
              color: TUI_COLORS.text,
            },
          },
        }),
      ),
    );
  };
}

function countLines(value: string): number {
  if (!value) {
    return 1;
  }
  return value.split(/\r?\n/).length;
}
