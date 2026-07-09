import { createHostSession } from "../../host/session.js";
import type { SessionStoreLike } from "../../session/index.js";
import type { SessionRecord } from "../../types.js";
import {
  formatRelativeSessionTime,
  formatSessionPickerTitle,
  parseSessionPickerChoice,
} from "../../session/picker.js";
import { renderKittyBanner } from "../banner.js";
import { TUI_COLORS } from "./theme.js";
import type { InkRuntime } from "./components/kit.js";

export interface TuiSessionSelection {
  session: SessionRecord;
  cwd: string;
}

export async function selectTuiSession(options: {
  cwd: string;
  cwdOverridden: boolean;
  sessionStore: SessionStoreLike;
  React: InkRuntime["React"];
  ink: Pick<typeof import("ink"), "Box" | "Text" | "render" | "useInput" | "useStdout">;
  limit?: number;
}): Promise<TuiSessionSelection | null> {
  const sessions = await options.sessionStore.list(options.limit ?? 10);
  if (sessions.length === 0) {
    return {
      session: await createHostSession(options.sessionStore, options.cwd),
      cwd: options.cwd,
    };
  }

  return new Promise((resolve) => {
    let app: ReturnType<typeof options.ink.render> | undefined;
    const finish = async (choice: number | null): Promise<void> => {
      app?.unmount();
      await app?.waitUntilExit().catch(() => undefined);
      if (choice === null) {
        resolve(null);
        return;
      }
      if (choice === 0) {
        resolve({
          session: await createHostSession(options.sessionStore, options.cwd),
          cwd: options.cwd,
        });
        return;
      }
      const session = sessions[choice - 1];
      if (!session) {
        resolve(null);
        return;
      }
      resolve({
        session,
        cwd: options.cwdOverridden ? options.cwd : session.cwd,
      });
    };

    const Picker = createTuiSessionPickerComponent({
      React: options.React,
      Box: options.ink.Box,
      Text: options.ink.Text,
      useInput: options.ink.useInput,
      useStdout: options.ink.useStdout,
    });

    app = options.ink.render(
      options.React.createElement(Picker, {
        sessions,
        now: new Date(),
        onSelect: (choice: number) => {
          void finish(choice);
        },
        onCancel: () => {
          void finish(null);
        },
      }),
      {
        exitOnCtrlC: false,
        alternateScreen: true,
      },
    );
  });
}

export function createTuiSessionPickerComponent(
  kit: Pick<InkRuntime, "React" | "Box" | "Text" | "useInput" | "useStdout">,
) {
  const { React, Box, Text, useInput, useStdout } = kit;
  return function TuiSessionPicker(props: {
    sessions: readonly SessionRecord[];
    now: Date;
    onSelect: (choice: number) => void;
    onCancel: () => void;
  }): React.ReactNode {
    const [cursor, setCursor] = React.useState(1);
    const { stdout } = useStdout();
    const width = Math.max(40, stdout.columns ?? 80);
    const choices = props.sessions.length + 1;

    useInput((input, key) => {
      if (key.ctrl && input === "c") {
        props.onCancel();
        return;
      }
      if (key.escape) {
        props.onCancel();
        return;
      }
      if (key.upArrow) {
        setCursor((value) => wrapChoice(value - 1, choices));
        return;
      }
      if (key.downArrow) {
        setCursor((value) => wrapChoice(value + 1, choices));
        return;
      }
      if (key.return) {
        props.onSelect(cursor);
        return;
      }
      const parsed = parseSessionPickerChoice(input, props.sessions.length);
      if (parsed.kind === "new") {
        props.onSelect(0);
      } else if (parsed.kind === "existing") {
        props.onSelect(parsed.index + 1);
      }
    });

    return React.createElement(
      Box,
      {
        flexDirection: "column",
        width,
        minHeight: 16,
        paddingX: 3,
        paddingY: 1,
        backgroundColor: TUI_COLORS.background,
      },
      React.createElement(Text, { color: TUI_COLORS.user, bold: true }, renderKittyBanner()),
      React.createElement(
        Box,
        { flexDirection: "row", marginTop: 1 },
        React.createElement(Text, { color: TUI_COLORS.text, bold: true }, props.sessions.length > 0 ? "继续会话" : "新会话"),
        React.createElement(Text, { color: TUI_COLORS.muted }, "  Enter 进入  ↑/↓ 切换  0 新建  Esc 退出"),
      ),
      React.createElement(Box, { marginTop: 1, flexDirection: "column" },
        renderChoiceLine(React, Text, cursor === 0, "0", "新建会话", ""),
        ...props.sessions.map((session, index) =>
          renderChoiceLine(
            React,
            Text,
            cursor === index + 1,
            String(index + 1),
            formatSessionPickerTitle(session),
            formatRelativeSessionTime(session.updatedAt, props.now),
          )),
      ),
    );
  };
}

function renderChoiceLine(
  React: InkRuntime["React"],
  Text: typeof import("ink").Text,
  selected: boolean,
  index: string,
  title: string,
  meta: string,
): React.ReactNode {
  return React.createElement(
    Text,
    { color: selected ? TUI_COLORS.user : TUI_COLORS.text, bold: selected },
    `${selected ? "▌" : " "} ${index}. ${title}${meta ? `  ${meta}` : ""}`,
  );
}

function wrapChoice(value: number, count: number): number {
  if (value < 0) {
    return count - 1;
  }
  if (value >= count) {
    return 0;
  }
  return value;
}
