import type { AgentCallbacks } from "../../agent/types.js";
import type { InteractionTurnDisplay } from "../../interaction/shell.js";
import type { TuiController } from "./controller.js";
import type { TuiRuntimeDockState } from "./store.js";
import { createRunningActivity } from "./activity.js";
import { translate, type KittyLocale } from "../../i18n/index.js";
import {
  projectTuiRuntimeStatusActivity,
  projectTuiToolCallFact,
  projectTuiToolErrorFact,
  projectTuiToolResultFact,
} from "./toolFacts.js";

export function createTuiTurnDisplay(options: {
  controller: TuiController;
  config: { locale: KittyLocale; showReasoning: boolean };
  abortSignal: AbortSignal;
}): InteractionTurnDisplay {
  let aborted = false;
  let startedAt: number | undefined;
  let finished = false;
  const isAborted = (): boolean => aborted || options.abortSignal.aborted;
  const updateActivity = (activity: TuiRuntimeDockState["activity"]): void => {
    if (!isAborted()) {
      options.controller.updateDock({
        activity,
      });
    }
  };
  options.abortSignal.addEventListener("abort", () => {
    aborted = true;
    finishTurn("aborted");
  });

  const callbacks: AgentCallbacks = {
    onModelWaitStart() {
      updateActivity(createRunningActivity({
        kind: "model",
        summary: translate(options.config.locale, "runtime.thinking"),
      }));
    },
    onModelWaitStop() {
      updateActivity(undefined);
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
      options.controller.updateDock({
        activity: undefined,
      });
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
      options.controller.append("system", translate(options.config.locale, "runtime.toolFailed", { name }));
    },
    onStatus(text) {
      if (isAborted()) {
        return;
      }
      const activity = projectTuiRuntimeStatusActivity(text);
      options.controller.updateDock({
        activity,
      });
    },
  };

  return {
    callbacks,
    start() {
      startedAt = Date.now();
      finished = false;
      options.controller.updateDock({
        turnStartedAt: startedAt,
      });
    },
    finish(status) {
      finishTurn(status);
    },
    flush() {
      if (!finished) finishTurn(aborted ? "aborted" : "completed");
    },
    dispose() {
      if (!finished) finishTurn(aborted ? "aborted" : "completed");
    },
  };

  function finishTurn(status: "completed" | "failed" | "aborted"): void {
    if (finished) return;
    finished = true;
    options.controller.updateDock({
      activity: undefined,
      turnStartedAt: undefined,
    });
  }

}

function toDockPatch(fact: {
  activity: TuiRuntimeDockState["activity"];
  background?: string;
}): Partial<TuiRuntimeDockState> {
  const patch: Partial<TuiRuntimeDockState> = {
    activity: fact.activity,
  };
  if ("background" in fact) {
    patch.background = fact.background;
  }
  return patch;
}
