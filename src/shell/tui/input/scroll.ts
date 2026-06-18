import type { WriteStream } from "node:tty";

const ENABLE_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
const DISABLE_MOUSE_TRACKING = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";

export function enableMouseWheelTracking(output: Pick<WriteStream, "write"> = process.stdout): () => void {
  output.write(ENABLE_MOUSE_TRACKING);
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    output.write(DISABLE_MOUSE_TRACKING);
  };
}

export function parseMouseWheelDelta(input: string): number {
  let delta = 0;
  for (const match of input.matchAll(SGR_MOUSE_PATTERN)) {
    const code = Number(match[1]);
    if (Number.isNaN(code)) {
      continue;
    }
    if ((code & 64) !== 64) {
      continue;
    }
    delta += (code & 1) === 1 ? 3 : -3;
  }

  for (let index = 0; index < input.length - 5; index += 1) {
    if (input.charCodeAt(index) !== 0x1b || input[index + 1] !== "[" || input[index + 2] !== "M") {
      continue;
    }
    const code = input.charCodeAt(index + 3) - 32;
    if ((code & 64) !== 64) {
      continue;
    }
    delta += (code & 1) === 1 ? 3 : -3;
  }

  return delta;
}

export function stripMouseInputSequences(input: string): string {
  return input
    .replace(SGR_MOUSE_PATTERN, "")
    .replace(X10_MOUSE_PATTERN, "");
}

const SGR_MOUSE_PATTERN = /\x1b\[<(\d+);(\d+);(\d+)([mM])/g;
const X10_MOUSE_PATTERN = /\x1b\[M[\s-\x7f]{3}/g;
