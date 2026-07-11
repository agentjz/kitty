import type { RunTurnOptions } from "../../src/agent/types.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { InteractiveSessionDriver } from "../../src/interaction/sessionDriver.js";
import type { InteractionShell, ShellInputResult } from "../../src/interaction/shell.js";
import { SessionStore } from "../../src/session/store.js";
import { createTestRuntimeConfig } from "../helpers.js";

async function main(): Promise<void> {
  const [root, sessionId] = process.argv.slice(2);
  if (!root || !sessionId) throw new Error("Expected state root and session ID.");

  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.load(sessionId);
  const inputs: ShellInputResult[] = [
    { kind: "submit", value: "active before hard kill" },
    { kind: "submit", value: "survive hard kill" },
  ];
  const shell: InteractionShell = {
    input: {
      async readInput() {
        return inputs.shift() ?? new Promise<ShellInputResult>(() => undefined);
      },
      bindInterrupt() {
        return () => undefined;
      },
    },
    output: {
      plain() {},
      info() {},
      warn() {},
      error() {},
      dim() {},
      heading() {},
      interrupt() {},
    },
    createTurnDisplay() {
      return {
        callbacks: {},
        flush() {},
        dispose() {},
      };
    },
  };

  setInterval(() => {
    const ledger = new ControlPlaneLedger(root);
    try {
      const turns = ledger.turns.listBySession(sessionId);
      if (turns.length === 2 && turns[0]?.status === "running" && turns[1]?.status === "queued") {
        process.stdout.write("READY\n");
      }
    } finally {
      ledger.close();
    }
  }, 20);

  const driver = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session,
    sessionStore,
    shell,
    runTurn: async (_options: RunTurnOptions) => new Promise(() => undefined),
  });

  await driver.run();
}

void main();
