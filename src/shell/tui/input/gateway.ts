import { PassThrough } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { ReadStream } from "node:tty";
import { parseTuiMouseEvents, stripMouseInputSequences, type TuiMouseEvent } from "./scroll.js";

const TERMINAL_SEQUENCE_FLUSH_MS = 30;

export interface TuiInputGateway {
  readonly stdin: NodeJS.ReadStream;
  suspend(): () => void;
  dispose(): void;
}

export function createTuiInputGateway(options: {
  source?: NodeJS.ReadStream;
  onClose?: () => void;
  onMouseEvent?: (event: TuiMouseEvent) => void;
  onMouseWheel?: (delta: number) => void;
}): TuiInputGateway {
  const source = options.source ?? process.stdin;
  const filtered = new PassThrough();
  const decoder = new StringDecoder("utf8");
  let pendingTerminalInput = "";
  let pendingTerminalInputTimer: NodeJS.Timeout | undefined;
  mirrorTtyFacts(source, filtered);

  const forwardInput = (text: string): void => {
    if (!text) return;
    const mouseEvents = parseTuiMouseEvents(text);
    for (const event of mouseEvents) {
      options.onMouseEvent?.(event);
      if (event.kind === "wheel") options.onMouseWheel?.(event.delta);
    }
    const keyboardInput = stripMouseInputSequences(text);
    if (keyboardInput.length > 0) {
      filtered.write(keyboardInput);
    }
  };

  const clearPendingTerminalInputTimer = (): void => {
    if (!pendingTerminalInputTimer) return;
    clearTimeout(pendingTerminalInputTimer);
    pendingTerminalInputTimer = undefined;
  };
  const flushPendingTerminalInput = (): void => {
    clearPendingTerminalInputTimer();
    const pending = pendingTerminalInput;
    pendingTerminalInput = "";
    forwardInput(pending);
  };
  const pushDecodedInput = (text: string): void => {
    clearPendingTerminalInputTimer();
    const combined = pendingTerminalInput + text;
    pendingTerminalInput = "";
    const pendingStart = findIncompleteTerminalSequenceStart(combined);
    if (pendingStart === undefined) {
      forwardInput(combined);
      return;
    }
    forwardInput(combined.slice(0, pendingStart));
    pendingTerminalInput = combined.slice(pendingStart);
    pendingTerminalInputTimer = setTimeout(flushPendingTerminalInput, TERMINAL_SEQUENCE_FLUSH_MS);
    pendingTerminalInputTimer.unref();
  };

  const onData = (chunk: Buffer | string): void => {
    pushDecodedInput(typeof chunk === "string" ? chunk : decoder.write(chunk));
  };

  let listening = true;
  let closed = false;
  source.on("data", onData);

  const detachSource = (): void => {
    source.off("data", onData);
    source.off("end", onEnd);
    source.off("close", onClose);
    source.off("error", onError);
  };
  const finishFromSource = (error?: Error): void => {
    if (closed) return;
    closed = true;
    listening = false;
    detachSource();
    pushDecodedInput(decoder.end());
    flushPendingTerminalInput();
    if (error) filtered.destroy(error);
    else filtered.end();
    options.onClose?.();
  };
  const onEnd = (): void => finishFromSource();
  const onClose = (): void => finishFromSource();
  const onError = (error: Error): void => finishFromSource(error);

  source.on("end", onEnd);
  source.on("close", onClose);
  source.on("error", onError);

  return {
    stdin: filtered as unknown as NodeJS.ReadStream,
    suspend() {
      if (closed || !listening) return () => undefined;
      listening = false;
      source.off("data", onData);
      flushPendingTerminalInput();
      return () => {
        if (closed || listening) return;
        listening = true;
        source.on("data", onData);
      };
    },
    dispose() {
      if (closed) return;
      closed = true;
      listening = false;
      detachSource();
      clearPendingTerminalInputTimer();
      pendingTerminalInput = "";
      filtered.end();
    },
  };
}

function findIncompleteTerminalSequenceStart(input: string): number | undefined {
  const start = input.lastIndexOf("\x1b");
  if (start < 0) return undefined;
  const suffix = input.slice(start);
  if ("\x1b[<".startsWith(suffix) || "\x1b[M".startsWith(suffix)) return start;
  if (suffix.startsWith("\x1b[M")) return suffix.length < 6 ? start : undefined;
  if (!suffix.startsWith("\x1b[<")) return undefined;
  if (/^\x1b\[<\d+;\d+;\d+[mM]$/u.test(suffix)) return undefined;
  return /^\x1b\[<\d*(?:;\d*){0,2}$/u.test(suffix) ? start : undefined;
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
