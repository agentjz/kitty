import type { WriteStream } from "node:tty";

const ENABLE_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
const DISABLE_MOUSE_TRACKING = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";

export function enableMouseTracking(output: Pick<WriteStream, "write"> = process.stdout): () => void {
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

export type TuiMouseEvent =
  | { kind: "wheel"; x: number; y: number; delta: number }
  | { kind: "press" | "drag" | "release"; button: "left"; x: number; y: number };

export function parseTuiMouseEvents(input: string): TuiMouseEvent[] {
  const events: TuiMouseEvent[] = [];
  for (const match of input.matchAll(SGR_MOUSE_PATTERN)) {
    const code = Number(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);
    if (![code, x, y].every(Number.isFinite)) continue;
    if ((code & 64) === 64) {
      events.push({ kind: "wheel", x, y, delta: (code & 1) === 1 ? 3 : -3 });
      continue;
    }
    const button = code & 3;
    if (match[4] === "m" || button === 3) {
      events.push({ kind: "release", button: "left", x, y });
      continue;
    }
    if (button !== 0) continue;
    events.push({ kind: (code & 32) === 32 ? "drag" : "press", button: "left", x, y });
  }

  for (let index = 0; index < input.length - 5; index += 1) {
    if (input.charCodeAt(index) !== 0x1b || input[index + 1] !== "[" || input[index + 2] !== "M") continue;
    const code = input.charCodeAt(index + 3) - 32;
    const x = input.charCodeAt(index + 4) - 32;
    const y = input.charCodeAt(index + 5) - 32;
    if ((code & 64) === 64) {
      events.push({ kind: "wheel", x, y, delta: (code & 1) === 1 ? 3 : -3 });
      continue;
    }
    const button = code & 3;
    if (button === 3) {
      events.push({ kind: "release", button: "left", x, y });
    } else if (button === 0) {
      events.push({ kind: (code & 32) === 32 ? "drag" : "press", button: "left", x, y });
    }
  }
  return events;
}

export function parseMouseWheelDelta(input: string): number {
  return parseTuiMouseEvents(input)
    .filter((event): event is Extract<TuiMouseEvent, { kind: "wheel" }> => event.kind === "wheel")
    .reduce((sum, event) => sum + event.delta, 0);
}

export function stripMouseInputSequences(input: string): string {
  return input
    .replace(SGR_MOUSE_PATTERN, "")
    .replace(X10_MOUSE_PATTERN, "");
}

const SGR_MOUSE_PATTERN = /\x1b\[<(\d+);(\d+);(\d+)([mM])/g;
const X10_MOUSE_PATTERN = /\x1b\[M[\x20-\x7f]{3}/g;
