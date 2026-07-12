import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createTuiInputGateway } from "../../src/shell/tui/input/gateway.js";
import { parseTuiMouseEvents } from "../../src/shell/tui/input/scroll.js";

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

test("tui input gateway frames mouse sequences split across arbitrary chunks", async () => {
  const source = new PassThrough();
  const mouseEvents: unknown[] = [];
  const gateway = createTuiInputGateway({
    source: source as unknown as NodeJS.ReadStream,
    onMouseEvent(event) {
      mouseEvents.push(event);
    },
  });
  const chunks: string[] = [];
  gateway.stdin.on("data", (chunk) => chunks.push(chunk.toString()));

  source.write("\x1b");
  source.write("[<64;10");
  source.write(";5Mhe");
  source.write("llo\x1b[M");
  source.write(String.fromCharCode(32, 42));
  source.write(String.fromCharCode(37));
  await new Promise((resolve) => setImmediate(resolve));

  gateway.dispose();
  assert.deepEqual(chunks, ["he", "llo"]);
  assert.deepEqual(mouseEvents, [
    { kind: "wheel", x: 10, y: 5, delta: -3 },
    { kind: "press", button: "left", x: 10, y: 5 },
  ]);
});

test("tui input gateway suspends parent input while an external editor owns the terminal", async () => {
  const source = new PassThrough();
  const gateway = createTuiInputGateway({
    source: source as unknown as NodeJS.ReadStream,
    onMouseWheel() {},
  });
  const chunks: string[] = [];
  gateway.stdin.on("data", (chunk) => chunks.push(chunk.toString()));

  const resume = gateway.suspend();
  source.write("editor input");
  await new Promise((resolve) => setImmediate(resolve));
  resume();
  source.write("kitty input");
  await new Promise((resolve) => setImmediate(resolve));

  gateway.dispose();
  assert.deepEqual(chunks, ["kitty input"]);
});

test("tui input gateway preserves UTF-8 IME text split across byte chunks", async () => {
  const source = new PassThrough();
  const gateway = createTuiInputGateway({
    source: source as unknown as NodeJS.ReadStream,
  });
  const chunks: string[] = [];
  gateway.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
  const input = Buffer.from("你好");

  source.write(input.subarray(0, 1));
  source.write(input.subarray(1, 4));
  source.write(input.subarray(4));
  await new Promise((resolve) => setImmediate(resolve));

  gateway.dispose();
  assert.equal(chunks.join(""), "你好");
  assert.doesNotMatch(chunks.join(""), /�/u);
});

test("tui input gateway preserves split bracketed paste markers and multiline UTF-8 payload", async () => {
  const source = new PassThrough();
  const gateway = createTuiInputGateway({
    source: source as unknown as NodeJS.ReadStream,
  });
  const chunks: string[] = [];
  gateway.stdin.on("data", (chunk) => chunks.push(chunk.toString()));

  source.write("\x1b[2");
  source.write("00~第一行\r");
  source.write("\n第二行\x1b[");
  source.write("201~");
  await new Promise((resolve) => setImmediate(resolve));

  gateway.dispose();
  assert.equal(chunks.join(""), "\x1b[200~第一行\r\n第二行\x1b[201~");
});

test("tui input gateway reports source EOF once and closes its filtered stream", async () => {
  const source = new PassThrough();
  let closeCount = 0;
  const gateway = createTuiInputGateway({
    source: source as unknown as NodeJS.ReadStream,
    onClose() {
      closeCount += 1;
    },
  });
  gateway.stdin.resume();
  const ended = new Promise<void>((resolve) => gateway.stdin.once("end", resolve));

  source.end();
  await ended;
  source.emit("close");

  gateway.dispose();
  assert.equal(closeCount, 1);
});

test("tui mouse parser preserves press drag release and wheel coordinates", () => {
  assert.deepEqual(
    parseTuiMouseEvents("\x1b[<0;12;4M\x1b[<32;12;3M\x1b[<0;12;3m\x1b[<65;8;2M"),
    [
      { kind: "press", button: "left", x: 12, y: 4 },
      { kind: "drag", button: "left", x: 12, y: 3 },
      { kind: "release", button: "left", x: 12, y: 3 },
      { kind: "wheel", x: 8, y: 2, delta: 3 },
    ],
  );
});
