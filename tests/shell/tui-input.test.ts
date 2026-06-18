import assert from "node:assert/strict";
import test from "node:test";

import { parseMouseWheelDelta } from "../../src/shell/tui/input/scroll.js";

test("tui parses SGR mouse wheel escape sequences", () => {
  assert.equal(parseMouseWheelDelta("\x1b[<64;10;5M"), -3);
  assert.equal(parseMouseWheelDelta("\x1b[<65;10;5M"), 3);
  assert.equal(parseMouseWheelDelta("\x1b[<64;10;5M\x1b[<65;10;5M"), 0);
});

test("tui ignores non-wheel mouse sequences", () => {
  assert.equal(parseMouseWheelDelta("\x1b[<0;10;5M"), 0);
  assert.equal(parseMouseWheelDelta("abc"), 0);
});
