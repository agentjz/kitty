import { PassThrough } from "node:stream";
import type { ReadStream } from "node:tty";
import { parseMouseWheelDelta, stripMouseInputSequences } from "./scroll.js";

export interface TuiInputGateway {
  readonly stdin: NodeJS.ReadStream;
  dispose(): void;
}

export function createTuiInputGateway(options: {
  source?: NodeJS.ReadStream;
  onMouseWheel: (delta: number) => void;
}): TuiInputGateway {
  const source = options.source ?? process.stdin;
  const filtered = new PassThrough();
  mirrorTtyFacts(source, filtered);

  const onData = (chunk: Buffer | string): void => {
    const text = chunk.toString();
    const delta = parseMouseWheelDelta(text);
    if (delta !== 0) {
      options.onMouseWheel(delta);
    }
    const keyboardInput = stripMouseInputSequences(text);
    if (keyboardInput.length > 0) {
      filtered.write(keyboardInput);
    }
  };

  source.on("data", onData);

  return {
    stdin: filtered as unknown as NodeJS.ReadStream,
    dispose() {
      source.off("data", onData);
      filtered.end();
    },
  };
}

function mirrorTtyFacts(source: NodeJS.ReadStream, target: PassThrough): void {
  const tty = source as Partial<Pick<ReadStream, "isTTY" | "setRawMode" | "ref" | "unref">>;
  const output = target as PassThrough & Partial<Pick<ReadStream, "isTTY" | "setRawMode" | "ref" | "unref">>;
  output.isTTY = Boolean(tty.isTTY);
  output.setRawMode = (mode: boolean) => {
    tty.setRawMode?.(mode);
    return output as unknown as ReadStream;
  };
  output.ref = () => {
    tty.ref?.();
    return output as unknown as ReadStream;
  };
  output.unref = () => {
    tty.unref?.();
    return output as unknown as ReadStream;
  };
}
