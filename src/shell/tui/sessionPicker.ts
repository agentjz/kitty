import { createHostSession } from "../../host/session.js";
import type { SessionStoreLike } from "../../session/index.js";
import type { SessionRecord } from "../../types.js";
import {
  formatRelativeSessionTime,
  formatSessionPickerTitle,
  parseSessionPickerChoice,
} from "../../session/picker.js";
import { TUI_COLORS } from "./theme.js";
import type { InkRuntime } from "./components/kit.js";
import { createWelcomeWordmarkComponent } from "./components/WelcomeWordmark.js";
import { createWelcomeTipComponent } from "./components/WelcomeTip.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../../i18n/index.js";

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
  locale?: KittyLocale;
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
        locale: options.locale ?? DEFAULT_LOCALE,
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
  const WelcomeWordmark = createWelcomeWordmarkComponent(kit);
  const WelcomeTip = createWelcomeTipComponent(kit);
  return function TuiSessionPicker(props: {
    locale?: KittyLocale;
    sessions: readonly SessionRecord[];
    now: Date;
    onSelect: (choice: number) => void;
    onCancel: () => void;
  }): React.ReactNode {
    const locale = props.locale ?? DEFAULT_LOCALE;
    const [cursor, setCursor] = React.useState(1);
    const { stdout } = useStdout();
    const width = Math.max(40, stdout.columns ?? 80);
    const height = Math.max(16, stdout.rows ?? 24);
    const contentWidth = Math.max(36, Math.min(76, width - 8));
    const choices = props.sessions.length + 1;
    const compact = height < 10 + choices;
    const dense = height < 7 + choices;

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
        height,
        alignItems: "center",
        paddingY: 1,
        backgroundColor: TUI_COLORS.background,
      },
      React.createElement(Box, { flexGrow: 1, minHeight: 0 }),
      React.createElement(
        Box,
        { flexDirection: "column", flexShrink: 0, width: contentWidth },
        React.createElement(
          Box,
          { justifyContent: "center", width: "100%" },
          React.createElement(WelcomeWordmark, { compact }),
        ),
        dense ? null : React.createElement(WelcomeTip, { locale }),
        React.createElement(Box, { height: 1 }),
        React.createElement(
          Box,
          { flexDirection: "column" },
          renderChoiceLine(React, Box, Text, cursor === 0, "0", translate(locale, "tui.newSession"), ""),
          ...props.sessions.map((session, index) =>
            renderChoiceLine(
              React,
              Box,
              Text,
              cursor === index + 1,
              String(index + 1),
              formatSessionPickerTitle(session, locale),
              formatRelativeSessionTime(session.updatedAt, props.now, locale),
            )),
        ),
        dense ? null : React.createElement(Box, { height: 1 }),
        dense ? null : React.createElement(Text, { color: TUI_COLORS.muted }, translate(locale, "tui.sessionControls")),
      ),
      React.createElement(Box, { flexGrow: 1, minHeight: 0 }),
    );
  };
}

function renderChoiceLine(
  React: InkRuntime["React"],
  Box: typeof import("ink").Box,
  Text: typeof import("ink").Text,
  selected: boolean,
  index: string,
  title: string,
  meta: string,
): React.ReactNode {
  return React.createElement(
    Box,
    { flexDirection: "row", height: 1 },
    React.createElement(Text, { color: selected ? TUI_COLORS.accentGold : TUI_COLORS.background }, selected ? "▌ " : "  "),
    React.createElement(Text, { color: TUI_COLORS.muted }, `${index}. `),
    React.createElement(Text, { color: TUI_COLORS.text, bold: selected }, title),
    meta ? React.createElement(Text, { color: TUI_COLORS.muted }, `  ${meta}`) : null,
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
