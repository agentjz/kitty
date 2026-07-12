import { applyComposerInput, killComposerText, type ComposerInputKey } from "./composerEditing.js";
import {
  filterTuiCommandMenu,
  moveTuiCommandSelection,
  readSlashCommandQuery,
} from "./commandMenu.js";
import { filterTuiInputHistory } from "./historySearch.js";
import { countTuiShortcutHelpRows } from "./keyboardHelp.js";
import {
  updateComposerState,
  updateOverlayState,
  type TuiState,
} from "./store.js";
import { translate } from "../../i18n/index.js";

export interface TuiComposerInteractionHost {
  appendSystem(text: string): void;
  getState(): TuiState;
  isDisposed(): boolean;
  persistDraft(): void;
  setState(state: TuiState): void;
  submitInput(value: string): boolean;
}

export class TuiComposerInteraction {
  private externalEditorActive = false;

  constructor(private readonly host: TuiComposerInteractionHost) {}

  handleInput(input: string, key: ComposerInputKey): void {
    if (this.host.isDisposed()) return;
    const state = this.host.getState();

    if (state.overlay.kind === "closed" && key.ctrl && input.toLowerCase() === "p") {
      this.setOverlay({ kind: "commandPalette", query: "", selectedIndex: 0 });
      return;
    }
    if (state.overlay.kind === "closed" && key.ctrl && input.toLowerCase() === "r") {
      this.setOverlay({ kind: "historySearch", query: "", selectedIndex: 0 });
      return;
    }
    if (state.overlay.kind === "closed" && input === "?" && !key.ctrl && !key.meta && !state.composer.value) {
      this.setOverlay({ kind: "keyboardHelp", offset: 0 });
      return;
    }
    if (state.overlay.kind !== "closed" && this.handleOverlayInput(input, key)) return;
    if (this.handleKillInput(input, key)) {
      this.synchronizeSlashMenu();
      return;
    }

    const current = this.host.getState().composer;
    const action = applyComposerInput({ cursor: current.cursor, value: current.value }, input, key);
    if (action.kind === "history") {
      this.navigateHistory(action.direction);
      return;
    }
    this.setDraft(action.state, true);
    if (action.kind === "submit") {
      if (!this.host.submitInput(action.value)) {
        this.setDraft({ cursor: action.value.length, value: action.value }, true);
      }
      return;
    }
    this.synchronizeSlashMenu();
  }

  handlePaste(text: string): void {
    if (this.host.isDisposed() || this.externalEditorActive || text.length === 0) return;
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const state = this.host.getState();
    if (state.overlay.kind !== "closed") {
      this.host.setState(updateOverlayState(state, { kind: "closed" }));
    }
    const current = this.host.getState().composer;
    const action = applyComposerInput(
      { cursor: current.cursor, value: current.value },
      normalized,
      {},
    );
    this.setDraft(action.state, true);
    this.synchronizeSlashMenu();
  }

  async editExternally(editor: (value: string) => Promise<string>): Promise<void> {
    if (this.host.isDisposed() || this.externalEditorActive) return;
    this.externalEditorActive = true;
    this.setOverlay({ kind: "closed" });
    try {
      const edited = await editor(this.host.getState().composer.value);
      if (!this.host.isDisposed()) {
        this.setDraft({ cursor: edited.length, value: edited }, true);
        this.synchronizeSlashMenu();
      }
    } catch (error) {
      if (!this.host.isDisposed()) {
        this.host.appendSystem(translate(this.host.getState().locale, "tui.externalEditorFailed", {
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    } finally {
      this.externalEditorActive = false;
    }
  }

  private handleOverlayInput(input: string, key: ComposerInputKey): boolean {
    const state = this.host.getState();
    const overlay = state.overlay;
    if (overlay.kind === "closed") return false;
    if (key.escape) {
      this.setOverlay({ kind: "closed" });
      return true;
    }
    if (overlay.kind === "keyboardHelp") {
      if (input === "?") {
        this.setOverlay({ kind: "closed" });
        return true;
      }
      const previous = key.upArrow || (key.ctrl && input.toLowerCase() === "p");
      const next = key.downArrow || (key.ctrl && input.toLowerCase() === "n");
      if (previous || next) {
        const maximum = Math.max(0, countTuiShortcutHelpRows() - 1);
        this.setOverlay({
          kind: "keyboardHelp",
          offset: Math.max(0, Math.min(maximum, overlay.offset + (previous ? -1 : 1))),
        });
        return true;
      }
      if (input || key.backspace || key.delete || key.return || key.tab) {
        this.setOverlay({ kind: "closed" });
        return false;
      }
      return true;
    }

    const commandItems = overlay.kind === "historySearch" ? [] : filterTuiCommandMenu(overlay.query, state.locale);
    const historyItems = overlay.kind === "historySearch"
      ? filterTuiInputHistory(state.composer.history, overlay.query)
      : [];
    const itemCount = overlay.kind === "historySearch" ? historyItems.length : commandItems.length;
    const previous = key.upArrow || (key.ctrl && input.toLowerCase() === "p");
    const next = key.downArrow
      || (key.ctrl && input.toLowerCase() === "n")
      || (overlay.kind === "historySearch" && key.ctrl && input.toLowerCase() === "r");
    if (previous || next) {
      this.setOverlay({
        ...overlay,
        selectedIndex: moveTuiCommandSelection(itemCount, overlay.selectedIndex, previous ? -1 : 1),
      });
      return true;
    }
    if ((key.tab || key.return) && itemCount > 0) {
      const selectedValue = overlay.kind === "historySearch"
        ? historyItems[Math.min(overlay.selectedIndex, historyItems.length - 1)]!.value
        : commandItems[Math.min(overlay.selectedIndex, commandItems.length - 1)]!.name;
      this.setDraft({ cursor: selectedValue.length, value: selectedValue }, true);
      this.setOverlay({ kind: "closed" });
      if (key.return && overlay.kind !== "historySearch") this.host.submitInput(selectedValue);
      return true;
    }
    if (overlay.kind === "commandPalette" || overlay.kind === "historySearch") {
      const action = applyComposerInput({ cursor: overlay.query.length, value: overlay.query }, input, {
        ...key,
        downArrow: false,
        return: false,
        tab: false,
        upArrow: false,
      });
      if (action.kind === "update") {
        this.setOverlay({ ...overlay, query: action.state.value, selectedIndex: 0 });
      }
      return true;
    }
    return false;
  }

  private handleKillInput(input: string, key: ComposerInputKey): boolean {
    if (!key.ctrl) return false;
    const state = this.host.getState();
    const command = input.toLowerCase();
    if (command === "y") {
      if (!state.composer.killBuffer) return true;
      const action = applyComposerInput(
        { cursor: state.composer.cursor, value: state.composer.value },
        state.composer.killBuffer,
        {},
      );
      this.setDraft(action.state, true);
      return true;
    }
    const kind = command === "k"
      ? "lineEnd"
      : command === "u"
        ? "lineStart"
        : command === "w"
          ? "previousWord"
          : undefined;
    if (!kind) return false;
    const killed = killComposerText(
      { cursor: state.composer.cursor, value: state.composer.value },
      kind,
    );
    this.host.setState(updateComposerState(state, {
      ...killed.state,
      historyIndex: state.composer.history.length,
      killBuffer: killed.killedText || state.composer.killBuffer,
      stashedDraft: undefined,
    }));
    this.host.persistDraft();
    return true;
  }

  private setDraft(draft: { cursor: number; value: string }, leaveHistory: boolean): void {
    const state = this.host.getState();
    this.host.setState(updateComposerState(state, {
      cursor: draft.cursor,
      value: draft.value,
      ...(leaveHistory ? { historyIndex: state.composer.history.length, stashedDraft: undefined } : {}),
    }));
    this.host.persistDraft();
  }

  private synchronizeSlashMenu(): void {
    const state = this.host.getState();
    const query = readSlashCommandQuery(state.composer.value, state.composer.cursor);
    if (query === undefined) {
      if (state.overlay.kind === "slashCommands") this.setOverlay({ kind: "closed" });
      return;
    }
    this.setOverlay({ kind: "slashCommands", query, selectedIndex: 0 });
  }

  private navigateHistory(direction: -1 | 1): void {
    const state = this.host.getState();
    const composer = state.composer;
    if (composer.history.length === 0) return;
    if (direction === -1) {
      const target = Math.max(0, composer.historyIndex - 1);
      const stashedDraft = composer.historyIndex === composer.history.length
        ? { cursor: composer.cursor, value: composer.value }
        : composer.stashedDraft;
      const value = composer.history[target] ?? composer.value;
      this.host.setState(updateComposerState(state, {
        cursor: value.length,
        historyIndex: target,
        stashedDraft,
        value,
      }));
      this.host.persistDraft();
      return;
    }
    if (composer.historyIndex >= composer.history.length) return;
    const target = composer.historyIndex + 1;
    if (target === composer.history.length) {
      const draft = composer.stashedDraft ?? { cursor: 0, value: "" };
      this.host.setState(updateComposerState(state, {
        cursor: draft.cursor,
        historyIndex: target,
        stashedDraft: undefined,
        value: draft.value,
      }));
      this.host.persistDraft();
      return;
    }
    const value = composer.history[target]!;
    this.host.setState(updateComposerState(state, { cursor: value.length, historyIndex: target, value }));
    this.host.persistDraft();
  }

  private setOverlay(overlay: TuiState["overlay"]): void {
    this.host.setState(updateOverlayState(this.host.getState(), overlay));
  }
}
