import { translate, type KittyLocale, type MessageKey } from "../../i18n/index.js";

export interface TuiShortcutHelpGroup {
  readonly title: string;
  readonly shortcuts: readonly { keys: string; action: string }[];
}

const TUI_SHORTCUT_HELP_DEFINITIONS: readonly {
  titleKey: MessageKey;
  shortcuts: readonly { keys: string; actionKey: MessageKey }[];
}[] = [
  {
    titleKey: "tui.help.discovery",
    shortcuts: [
      { keys: "/", actionKey: "tui.help.commandCompletion" },
      { keys: "Ctrl+P", actionKey: "tui.help.commandPalette" },
      { keys: "Ctrl+R", actionKey: "tui.help.historySearch" },
      { keys: "?", actionKey: "tui.help.shortcuts" },
    ],
  },
  {
    titleKey: "tui.help.input",
    shortcuts: [
      { keys: "Enter", actionKey: "tui.help.submit" },
      { keys: "Shift/Ctrl/Alt+Enter", actionKey: "tui.help.newline" },
      { keys: "Ctrl+A/E", actionKey: "tui.help.lineBounds" },
      { keys: "Ctrl+K/U/W/Y", actionKey: "tui.help.killYank" },
      { keys: "Ctrl+G", actionKey: "tui.help.externalEditor" },
    ],
  },
  {
    titleKey: "tui.help.navigation",
    shortcuts: [
      { keys: "Up/Down", actionKey: "tui.help.historyNavigation" },
      { keys: "Ctrl+Left/Right", actionKey: "tui.help.wordMovement" },
      { keys: "Tab/Enter", actionKey: "tui.help.menuConfirm" },
      { keys: "Esc", actionKey: "tui.help.closeOverlay" },
      { keys: "Ctrl+C", actionKey: "tui.help.interrupt" },
      { keys: "Ctrl+L", actionKey: "tui.help.redraw" },
    ],
  },
] as const;

export function getTuiShortcutHelp(locale: KittyLocale): readonly TuiShortcutHelpGroup[] {
  return TUI_SHORTCUT_HELP_DEFINITIONS.map((group) => ({
    title: translate(locale, group.titleKey),
    shortcuts: group.shortcuts.map((shortcut) => ({
      keys: shortcut.keys,
      action: translate(locale, shortcut.actionKey),
    })),
  }));
}

export function countTuiShortcutHelpRows(): number {
  return TUI_SHORTCUT_HELP_DEFINITIONS.reduce((rows, group) => rows + 1 + group.shortcuts.length, 0);
}
