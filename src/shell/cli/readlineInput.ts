import readline from "node:readline";
import process from "node:process";

import type { ShellInputPort } from "../../interaction/shell.js";

export async function readPersistentInput(
  promptLabel: string,
  onInterrupt: () => void,
  abortSignal?: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    let settled = false;

    const cleanup = (): void => {
      rl.removeAllListeners("line");
      rl.removeAllListeners("close");
      rl.removeAllListeners("SIGINT");
      abortSignal?.removeEventListener("abort", onAbort);
    };

    const finish = (value: string | null): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      rl.close();
      resolve(value);
    };

    const onAbort = (): void => finish(null);
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    rl.on("line", (line) => {
      finish(line);
    });

    rl.on("SIGINT", () => {
      onInterrupt();
      rl.prompt();
    });

    rl.on("close", () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(null);
    });

    rl.setPrompt(promptLabel);
    rl.prompt();
  });
}

export function createReadlineInputPort(): ShellInputPort {
  const listeners = new Set<() => void>();
  let releaseProcessInterrupt: (() => void) | null = null;
  let activeRead: AbortController | undefined;
  const notifyInterrupt = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const ensureProcessInterruptBinding = (): void => {
    if (releaseProcessInterrupt) {
      return;
    }

    const handler = (): void => {
      notifyInterrupt();
    };

    process.on("SIGINT", handler);
    releaseProcessInterrupt = () => {
      process.off("SIGINT", handler);
      releaseProcessInterrupt = null;
    };
  };

  const maybeReleaseProcessInterruptBinding = (): void => {
    if (listeners.size > 0) {
      return;
    }

    releaseProcessInterrupt?.();
  };

  return {
    async readInput(promptLabel = "> ") {
      activeRead = new AbortController();
      const value = await readPersistentInput(promptLabel, notifyInterrupt, activeRead.signal);
      activeRead = undefined;
      return value === null ? { kind: "closed" } : { kind: "submit", value };
    },
    bindInterrupt(handler) {
      listeners.add(handler);
      ensureProcessInterruptBinding();
      return () => {
        listeners.delete(handler);
        maybeReleaseProcessInterruptBinding();
      };
    },
    close() {
      activeRead?.abort();
    },
  };
}
