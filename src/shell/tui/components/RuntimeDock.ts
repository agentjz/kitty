import type { TuiRuntimeDockState } from "../store.js";
import { TUI_COLORS } from "../theme.js";
import { TUI_DOCK_ROWS } from "../layout.js";
import type { InkRuntime } from "./kit.js";
import { formatElapsedCompact, type TuiActivity, type TuiActivitySeverity } from "../activity.js";
import { TUI_SPINNER_FRAMES, useTuiAnimationFrame } from "../animation.js";

export function createRuntimeDockComponent(kit: Pick<InkRuntime, "React" | "Box" | "Text">) {
  const { React, Box, Text } = kit;
  return function RuntimeDock(props: {
    dock: TuiRuntimeDockState;
    now?: number;
  }): React.ReactNode {
    const activity = props.dock.activity;
    const [clock, setClock] = React.useState(props.now ?? Date.now());
    React.useEffect(() => {
      if (props.now !== undefined || props.dock.turnStartedAt === undefined) {
        return undefined;
      }
      const timer = setInterval(() => setClock(Date.now()), 1_000);
      return () => clearInterval(timer);
    }, [props.dock.turnStartedAt, props.now]);
    const spinnerFrame = useTuiAnimationFrame(React, {
      enabled: props.now === undefined && activity?.status === "running",
      frameCount: TUI_SPINNER_FRAMES.length,
      intervalMs: 80,
    });
    const now = props.now ?? clock;
    const elapsed = props.dock.turnStartedAt !== undefined
      ? `思考中 ${formatElapsedCompact(now - props.dock.turnStartedAt)}`
      : undefined;
    const facts: Array<{ label: string; value: string }> = [];
    if (props.dock.background) {
      facts.push({ label: "后台", value: props.dock.background });
    }
    if (props.dock.subagent) {
      facts.push({ label: "子代理", value: props.dock.subagent });
    }
    const compactFacts = facts.map(({ label, value }) => `${label} ${value}`).join("  ·  ");
    return React.createElement(
      Box,
      {
        flexDirection: "column",
        width: "100%",
        height: TUI_DOCK_ROWS,
      },
      React.createElement(
        Box,
        { flexDirection: "row", height: 1, justifyContent: "space-between", width: "100%" },
        renderActivityRow(React, Box, Text, activity, { spinnerFrame }),
        compactFacts
          ? React.createElement(
            Box,
            { flexShrink: 1, marginLeft: 2, overflowX: "hidden" },
            React.createElement(Text, { color: TUI_COLORS.muted, wrap: "truncate-end" }, compactFacts),
          )
          : null,
        elapsed
          ? React.createElement(
            Box,
            { alignSelf: "flex-start", flexShrink: 0, height: 1, marginLeft: 2 },
            React.createElement(Text, { color: TUI_COLORS.muted, wrap: "truncate-end" }, elapsed),
          )
          : null,
      ),
    );
  };
}

function renderActivityRow(
  React: InkRuntime["React"],
  Box: typeof import("ink").Box,
  Text: typeof import("ink").Text,
  activity: TuiActivity | undefined,
  animation: { spinnerFrame: number },
): React.ReactNode {
  if (!activity) {
    return React.createElement(
      Box,
      { flexDirection: "row", flexGrow: 1, flexShrink: 1, height: 1, overflowX: "hidden" },
      React.createElement(Text, { color: TUI_COLORS.muted }, "空闲"),
    );
  }

  const color = readSeverityColor(activity.severity);
  if (activity.kind === "model" && activity.status === "running") {
    return React.createElement(
      Box,
      { flexDirection: "row", flexGrow: 1, flexShrink: 1, height: 1, overflowX: "hidden" },
      React.createElement(Text, { color }, readActivityMarker(activity, animation)),
      React.createElement(Text, { color: TUI_COLORS.muted }, "正在运行"),
    );
  }

  const label = readActivityLabel(activity);
  const blocker = activity.blockingLead ? "  阻塞 lead" : "";
  const detail = activity.detail ? `  ${activity.detail}` : "";
  return React.createElement(
    Box,
    { flexDirection: "row", flexGrow: 1, flexShrink: 1, height: 1, overflowX: "hidden" },
    React.createElement(Text, { color }, readActivityMarker(activity, animation)),
    React.createElement(Text, { color, bold: activity.status === "failed" }, `${label}：`),
    React.createElement(Text, { color: TUI_COLORS.text, wrap: "truncate-end" }, activity.summary),
    blocker ? React.createElement(Text, { color: TUI_COLORS.warning }, blocker) : null,
    detail ? React.createElement(Text, { color: TUI_COLORS.muted, wrap: "truncate-end" }, detail) : null,
  );
}

function readActivityMarker(activity: TuiActivity, animation: { spinnerFrame: number }): string {
  switch (activity.status) {
    case "failed":
      return "✕ ";
    case "completed":
      return "✓ ";
    case "waiting":
      return "⋯ ";
    case "running":
      return `${TUI_SPINNER_FRAMES[animation.spinnerFrame] ?? "⠋"} `;
  }
}

function readActivityLabel(activity: TuiActivity): string {
  if (activity.status === "failed") {
    return "失败";
  }
  if (activity.status === "waiting") {
    return activity.channel === "subagent" ? "子代理等待" : "正在等待";
  }
  if (activity.channel === "subagent") {
    return "子代理正在运行";
  }
  if (activity.kind === "background") {
    return "后台正在运行";
  }
  return "正在运行";
}

function readSeverityColor(severity: TuiActivitySeverity): string {
  switch (severity) {
    case "error":
      return TUI_COLORS.error;
    case "warning":
      return TUI_COLORS.warning;
    case "success":
      return TUI_COLORS.success;
    case "info":
      return TUI_COLORS.accentBlue;
  }
}
