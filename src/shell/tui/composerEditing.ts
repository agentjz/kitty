export interface ComposerDraftState {
  readonly cursor: number;
  readonly value: string;
}

export interface ComposerInputKey {
  readonly backspace?: boolean;
  readonly ctrl?: boolean;
  readonly delete?: boolean;
  readonly downArrow?: boolean;
  readonly end?: boolean;
  readonly escape?: boolean;
  readonly home?: boolean;
  readonly leftArrow?: boolean;
  readonly meta?: boolean;
  readonly return?: boolean;
  readonly rightArrow?: boolean;
  readonly shift?: boolean;
  readonly tab?: boolean;
  readonly upArrow?: boolean;
}

export type ComposerInputAction =
  | { readonly kind: "history"; readonly direction: -1 | 1; readonly state: ComposerDraftState }
  | { readonly kind: "submit"; readonly state: ComposerDraftState; readonly value: string }
  | { readonly kind: "update"; readonly state: ComposerDraftState };

export function applyComposerInput(
  state: ComposerDraftState,
  input: string,
  key: ComposerInputKey,
): ComposerInputAction {
  if (key.return && (key.shift || key.ctrl || key.meta)) {
    return insertText(state, "\n");
  }

  if (key.return) {
    return { kind: "submit", state: { cursor: 0, value: "" }, value: state.value };
  }

  if ((key.meta && input.toLowerCase() === "b") || (key.ctrl && key.leftArrow)) {
    return update({ ...state, cursor: previousWordOffset(state.value, state.cursor) });
  }

  if ((key.meta && input.toLowerCase() === "f") || (key.ctrl && key.rightArrow)) {
    return update({ ...state, cursor: nextWordOffset(state.value, state.cursor) });
  }

  if (key.ctrl && input.toLowerCase() === "a") {
    return update({ ...state, cursor: lineStartOffset(state.value, state.cursor) });
  }

  if (key.ctrl && input.toLowerCase() === "e") {
    return update({ ...state, cursor: lineEndOffset(state.value, state.cursor) });
  }

  if (key.upArrow) {
    return moveVertically(state, -1);
  }

  if (key.downArrow) {
    return moveVertically(state, 1);
  }

  if (key.leftArrow) {
    return update({ ...state, cursor: previousGraphemeOffset(state.value, state.cursor) });
  }

  if (key.rightArrow) {
    return update({ ...state, cursor: nextGraphemeOffset(state.value, state.cursor) });
  }

  if (key.home) {
    return update({ ...state, cursor: key.ctrl ? 0 : lineStartOffset(state.value, state.cursor) });
  }

  if (key.end) {
    return update({ ...state, cursor: key.ctrl ? state.value.length : lineEndOffset(state.value, state.cursor) });
  }

  if (key.backspace) {
    if (state.cursor <= 0) {
      return update(state);
    }
    const nextCursor = previousGraphemeOffset(state.value, state.cursor);
    return update({
      cursor: nextCursor,
      value: state.value.slice(0, nextCursor) + state.value.slice(state.cursor),
    });
  }

  if (key.delete || (key.ctrl && input.toLowerCase() === "d")) {
    if (state.cursor >= state.value.length) {
      return update(state);
    }
    const nextCursor = nextGraphemeOffset(state.value, state.cursor);
    return update({
      cursor: state.cursor,
      value: state.value.slice(0, state.cursor) + state.value.slice(nextCursor),
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

function moveVertically(state: ComposerDraftState, direction: -1 | 1): ComposerInputAction {
  const before = state.value.slice(0, state.cursor);
  const lineStart = before.lastIndexOf("\n") + 1;
  const column = state.cursor - lineStart;

  if (direction === -1) {
    if (lineStart === 0) {
      return { kind: "history", direction, state };
    }
    const previousLineEnd = lineStart - 1;
    const previousLineStart = state.value.lastIndexOf("\n", previousLineEnd - 1) + 1;
    return update({
      ...state,
      cursor: previousLineStart + Math.min(column, previousLineEnd - previousLineStart),
    });
  }

  const lineEnd = state.value.indexOf("\n", state.cursor);
  if (lineEnd === -1) {
    return { kind: "history", direction, state };
  }
  const nextLineStart = lineEnd + 1;
  const nextLineEnd = state.value.indexOf("\n", nextLineStart);
  const resolvedNextLineEnd = nextLineEnd === -1 ? state.value.length : nextLineEnd;
  return update({
    ...state,
    cursor: nextLineStart + Math.min(column, resolvedNextLineEnd - nextLineStart),
  });
}

export function killComposerText(
  state: ComposerDraftState,
  kind: "lineEnd" | "lineStart" | "previousWord",
): { state: ComposerDraftState; killedText: string } {
  if (kind === "lineEnd") {
    const end = lineEndOffset(state.value, state.cursor);
    const killEnd = end === state.cursor && end < state.value.length ? end + 1 : end;
    return removeRange(state, state.cursor, killEnd);
  }
  if (kind === "lineStart") {
    return removeRange(state, lineStartOffset(state.value, state.cursor), state.cursor);
  }
  return removeRange(state, previousWordOffset(state.value, state.cursor), state.cursor);
}

function removeRange(
  state: ComposerDraftState,
  start: number,
  end: number,
): { state: ComposerDraftState; killedText: string } {
  return {
    killedText: state.value.slice(start, end),
    state: {
      cursor: start,
      value: state.value.slice(0, start) + state.value.slice(end),
    },
  };
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

function lineStartOffset(value: string, cursor: number): number {
  return value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
}

function lineEndOffset(value: string, cursor: number): number {
  const end = value.indexOf("\n", cursor);
  return end === -1 ? value.length : end;
}

function previousWordOffset(value: string, cursor: number): number {
  let offset = Math.max(0, Math.min(cursor, value.length));
  while (offset > 0 && /\s/u.test(value[offset - 1]!)) offset = previousGraphemeOffset(value, offset);
  while (offset > 0 && !/\s/u.test(value[offset - 1]!)) offset = previousGraphemeOffset(value, offset);
  return offset;
}

function nextWordOffset(value: string, cursor: number): number {
  let offset = Math.max(0, Math.min(cursor, value.length));
  while (offset < value.length && !/\s/u.test(value[offset]!)) offset = nextGraphemeOffset(value, offset);
  while (offset < value.length && /\s/u.test(value[offset]!)) offset = nextGraphemeOffset(value, offset);
  return offset;
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
