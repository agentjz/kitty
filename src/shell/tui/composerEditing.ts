export interface ComposerDraftState {
  readonly cursor: number;
  readonly value: string;
}

export interface ComposerInputKey {
  readonly backspace?: boolean;
  readonly ctrl?: boolean;
  readonly delete?: boolean;
  readonly end?: boolean;
  readonly home?: boolean;
  readonly leftArrow?: boolean;
  readonly meta?: boolean;
  readonly return?: boolean;
  readonly rightArrow?: boolean;
  readonly shift?: boolean;
  readonly tab?: boolean;
}

export type ComposerInputAction =
  | { readonly kind: "submit"; readonly state: ComposerDraftState; readonly value: string }
  | { readonly kind: "update"; readonly state: ComposerDraftState };

export function applyComposerInput(
  state: ComposerDraftState,
  input: string,
  key: ComposerInputKey,
): ComposerInputAction {
  if (key.return && (key.shift || key.ctrl)) {
    return insertText(state, "\n");
  }

  if (key.return) {
    return { kind: "submit", state: { cursor: 0, value: "" }, value: state.value };
  }

  if (key.ctrl && input.toLowerCase() === "a") {
    return update({ ...state, cursor: 0 });
  }

  if (key.ctrl && input.toLowerCase() === "e") {
    return update({ ...state, cursor: state.value.length });
  }

  if (key.ctrl && input.toLowerCase() === "u") {
    return update({ cursor: 0, value: "" });
  }

  if (key.leftArrow) {
    return update({ ...state, cursor: previousGraphemeOffset(state.value, state.cursor) });
  }

  if (key.rightArrow) {
    return update({ ...state, cursor: nextGraphemeOffset(state.value, state.cursor) });
  }

  if (key.home) {
    return update({ ...state, cursor: 0 });
  }

  if (key.end) {
    return update({ ...state, cursor: state.value.length });
  }

  if (key.backspace || key.delete) {
    if (state.cursor <= 0) {
      return update(state);
    }
    const nextCursor = previousGraphemeOffset(state.value, state.cursor);
    return update({
      cursor: nextCursor,
      value: state.value.slice(0, nextCursor) + state.value.slice(state.cursor),
    });
  }

  if (key.tab) {
    return insertText(state, "  ");
  }

  if (!key.ctrl && !key.meta && input) {
    return insertText(state, normalizeTypedInput(input));
  }

  return update(state);
}

function insertText(state: ComposerDraftState, text: string): ComposerInputAction {
  if (!text) {
    return update(state);
  }
  const value = state.value.slice(0, state.cursor) + text + state.value.slice(state.cursor);
  return update({
    cursor: state.cursor + text.length,
    value,
  });
}

function normalizeTypedInput(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

function update(state: ComposerDraftState): ComposerInputAction {
  return { kind: "update", state };
}

const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function previousGraphemeOffset(value: string, cursor: number): number {
  if (cursor <= 0) {
    return 0;
  }
  let previous = 0;
  for (const segment of graphemeSegmenter.segment(value)) {
    if (segment.index >= cursor) {
      break;
    }
    previous = segment.index;
  }
  return previous;
}

function nextGraphemeOffset(value: string, cursor: number): number {
  if (cursor >= value.length) {
    return value.length;
  }
  for (const segment of graphemeSegmenter.segment(value)) {
    const end = segment.index + segment.segment.length;
    if (end > cursor) {
      return end;
    }
  }
  return value.length;
}
