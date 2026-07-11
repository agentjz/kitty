import type { TuiRuntimeDockState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import { formatElapsedCompact } from "../activity.js";
import type { InkRuntime } from "./kit.js";

export function createFooterMetaComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function FooterMeta(props: {
    dock: TuiRuntimeDockState;
    now?: number;
  }): React.ReactNode {
    const [clock, setClock] = React.useState(props.now ?? Date.now());
    React.useEffect(() => {
      if (props.now !== undefined || props.dock.turnStartedAt === undefined) {
        return undefined;
      }
      const timer = setInterval(() => setClock(Date.now()), 1_000);
      return () => clearInterval(timer);
    }, [props.dock.turnStartedAt, props.now]);
    const now = props.now ?? clock;
    const elapsed = props.dock.turnStartedAt === undefined
      ? undefined
      : `本轮 ${formatElapsedCompact(now - props.dock.turnStartedAt)}`;
    return React.createElement(
      Box,
      {
        flexDirection: "row",
        height: 1,
        justifyContent: "space-between",
        width: "100%",
      },
      React.createElement(
        Text,
        { color: TUI_COLORS.text, wrap: "truncate-end" },
        props.dock.model ? `模型 ${props.dock.model}` : "",
      ),
      React.createElement(
        Box,
        { flexDirection: "row", flexShrink: 1 },
        React.createElement(
          Text,
          { color: TUI_COLORS.text, wrap: "truncate-end" },
          `上下文 ${props.dock.context}`,
        ),
        elapsed
          ? React.createElement(Text, { color: TUI_COLORS.muted, wrap: "truncate-end" }, `  ${elapsed}`)
          : null,
      ),
    );
  };
}
