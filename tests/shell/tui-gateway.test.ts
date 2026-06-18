import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createTuiInputGateway } from "../../src/shell/tui/input/gateway.js";

test("tui input gateway keeps mouse facts out of keyboard input", async () => {
  const source = new PassThrough();
  let scrollDelta = 0;
  const gateway = createTuiInputGateway({
    source: source as unknown as NodeJS.ReadStream,
    onMouseWheel(delta) {
      scrollDelta += delta;
    },
  });

  const chunks: string[] = [];
  gateway.stdin.on("data", (chunk) => {
    chunks.push(chunk.toString());
  });

  source.write("\x1b[<64;10;5Mhello\x1b[<0;10;5M");
  await new Promise((resolve) => setImmediate(resolve));

  gateway.dispose();
  assert.equal(scrollDelta, -3);
  assert.deepEqual(chunks, ["hello"]);
});
