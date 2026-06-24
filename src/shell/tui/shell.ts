import type {
  InteractionShell,
  InteractionTurnDisplay,
  ShellInputPort,
  ShellOutputPort,
} from "../../interaction/shell.js";
import type { RuntimeConfig } from "../../types.js";
import type { TuiController } from "./controller.js";
import { createTuiTurnDisplay } from "./turnDisplay.js";

export function createTuiInteractionShell(controller: TuiController): InteractionShell {
  return {
    input: createTuiInputPort(controller),
    output: createTuiOutputPort(controller),
    createTurnDisplay(options: {
      cwd: string;
      config: RuntimeConfig;
      abortSignal: AbortSignal;
    }): InteractionTurnDisplay {
      return createTuiTurnDisplay({
        controller,
        config: options.config,
        abortSignal: options.abortSignal,
      });
    },
    dispose(): void {
      controller.dispose();
    },
  };
}

function createTuiInputPort(controller: TuiController): ShellInputPort {
  return {
    readInput(promptLabel) {
      return controller.readInput(promptLabel);
    },
    bindInterrupt(handler) {
      return controller.bindInterrupt(handler);
    },
  };
}

function createTuiOutputPort(controller: TuiController): ShellOutputPort {
  return {
    plain(text) {
      controller.appendOutput(text, "system");
    },
    info(text) {
      controller.appendOutput(text, "system");
    },
    warn(text) {
      controller.appendOutput(text, "system");
    },
    error(text) {
      controller.appendOutput(text, "system");
    },
    dim(text) {
      controller.appendOutput(text, "system");
    },
    heading(text) {
      controller.appendOutput(text, "system");
    },
    interrupt(text) {
      controller.appendOutput(text, "system");
    },
  };
}
