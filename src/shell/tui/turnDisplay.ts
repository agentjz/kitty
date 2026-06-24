import type { AgentCallbacks } from "../../agent/types.js";
import type { InteractionTurnDisplay } from "../../interaction/shell.js";
import type { TuiController } from "./controller.js";
import type { TuiRuntimeDockState } from "./store.js";
import { projectTuiToolCallFact, projectTuiToolErrorFact, projectTuiToolResultFact } from "./toolFacts.js";

export function createTuiTurnDisplay(options: {
  controller: TuiController;
  config: { showReasoning: boolean };
  abortSignal: AbortSignal;
}): InteractionTurnDisplay {
  let aborted = false;
  const isAborted = (): boolean => aborted || options.abortSignal.aborted;
  const updateCurrent = (current: string | undefined): void => {
    if (!isAborted()) {
      options.controller.updateDock({
        current,
      });
    }
  };

  options.abortSignal.addEventListener("abort", () => {
    aborted = true;
    updateCurrent(undefined);
  });

  const callbacks: AgentCallbacks = {
    onModelWaitStart() {
      updateCurrent("思考中");
    },
    onModelWaitStop() {
      updateCurrent(undefined);
    },
    onReasoningDelta(delta) {
      if (options.config.showReasoning && !isAborted()) {
        options.controller.appendStreaming("reasoning", delta);
      }
    },
    onReasoning(text) {
      if (options.config.showReasoning && !isAborted()) {
        options.controller.appendStreaming("reasoning", text);
      }
    },
    onAssistantDelta(delta) {
      if (!isAborted()) {
        options.controller.appendStreaming("assistant", delta);
      }
    },
    onAssistantText(text) {
      if (!isAborted()) {
        options.controller.append("assistant", text);
      }
    },
    onAssistantStage(text) {
      if (!isAborted()) {
        options.controller.append("assistant", text);
      }
    },
    onAssistantDone() {
      updateCurrent(undefined);
    },
    onToolCall(name, args) {
      if (isAborted()) {
        return;
      }
      const fact = projectTuiToolCallFact(name, args);
      options.controller.updateDock(toDockPatch(fact));
    },
    onToolResult(name, output) {
      if (isAborted()) {
        return;
      }
      const fact = projectTuiToolResultFact(name, output);
      options.controller.updateDock(toDockPatch(fact));
      if (fact.transcript) {
        options.controller.append("system", fact.transcript);
      }
    },
    onToolError(name, error) {
      if (isAborted()) {
        return;
      }
      const fact = projectTuiToolErrorFact(name, error);
      options.controller.updateDock(toDockPatch(fact));
      options.controller.append("system", `工具失败：${name}`);
    },
    onStatus(text) {
      if (isAborted()) {
        return;
      }
      options.controller.updateDock({
        current: text.trim() || undefined,
      });
    },
  };

  return {
    callbacks,
    flush() {
      options.controller.updateDock({
        current: undefined,
      });
    },
    dispose() {
      options.controller.updateDock({
        current: undefined,
      });
    },
  };
}

function toDockPatch(fact: {
  current?: string;
  background?: string;
  subagent?: string;
}): Partial<TuiRuntimeDockState> {
  const patch: Partial<TuiRuntimeDockState> = {
    current: fact.current,
  };
  if ("background" in fact) {
    patch.background = fact.background;
  }
  if ("subagent" in fact) {
    patch.subagent = fact.subagent;
  }
  return patch;
}
