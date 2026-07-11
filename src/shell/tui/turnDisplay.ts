import type { AgentCallbacks } from "../../agent/types.js";
import type { InteractionTurnDisplay } from "../../interaction/shell.js";
import type { RuntimeUiChannel, RuntimeUiEvent } from "../../runtime-ui/events.js";
import { channelLabel } from "../../runtime-ui/theme.js";
import type { TuiController } from "./controller.js";
import type { TuiRuntimeDockState } from "./store.js";
import { createRunningActivity } from "./activity.js";
import {
  projectTuiRuntimeStatusActivity,
  projectTuiToolCallFact,
  projectTuiToolErrorFact,
  projectTuiToolResultFact,
} from "./toolFacts.js";

export function createTuiTurnDisplay(options: {
  controller: TuiController;
  config: { showReasoning: boolean };
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
  let visibleChannel: RuntimeUiChannel | undefined;
  const ensureVisibleChannel = (channel: RuntimeUiChannel): void => {
    if (visibleChannel === channel || isAborted()) {
      return;
    }
    visibleChannel = channel;
    options.controller.append("system", `[${channelLabel(channel)}]`);
  };

  options.abortSignal.addEventListener("abort", () => {
    aborted = true;
    finishTurn("aborted");
  });

  const callbacks: AgentCallbacks = {
    onRuntimeUiEvent(event) {
      renderRuntimeUiEvent(event);
    },
    onModelWaitStart() {
      updateActivity(createRunningActivity({ kind: "model", channel: "lead", summary: "思考中" }));
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
      options.controller.append("system", `工具失败：${name}`);
    },
    onStatus(text) {
      if (isAborted()) {
        return;
      }
      const activity = projectTuiRuntimeStatusActivity(text, "system");
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

  function renderRuntimeUiEvent(event: RuntimeUiEvent): void {
    if (isAborted()) {
      return;
    }
    ensureVisibleChannel(event.channel);
    switch (event.kind) {
      case "assistant_text":
        if (event.message) {
          options.controller.appendStreaming(event.channel === "subagent" ? "subagent" : "assistant", event.message);
        }
        return;
      case "reasoning":
        if (options.config.showReasoning && event.message) {
          options.controller.appendStreaming(event.channel === "subagent" ? "subagent_reasoning" : "reasoning", event.message);
        }
        return;
      case "status":
        options.controller.updateDock({
          activity: projectTuiRuntimeStatusActivity(event.message ?? "", event.channel),
        });
        return;
      case "tool_call": {
        const fact = projectTuiToolCallFact(event.toolName ?? "tool", event.payload ?? "{}", { channel: event.channel });
        options.controller.updateDock(toDockPatch(fact));
        return;
      }
      case "tool_result": {
        const fact = projectTuiToolResultFact(event.toolName ?? "tool", event.payload ?? event.message ?? "");
        options.controller.updateDock(toDockPatch(fact));
        if (fact.transcript) {
          options.controller.append("system", fact.transcript);
        }
        return;
      }
      case "tool_error": {
        const fact = projectTuiToolErrorFact(event.toolName ?? "tool", event.payload ?? event.message ?? "");
        options.controller.updateDock({
          ...toDockPatch(fact),
          activity: fact.activity
            ? { ...fact.activity, channel: event.channel, blockingLead: event.channel === "subagent" }
            : undefined,
        });
        options.controller.append("system", `工具失败：${event.toolName ?? "tool"}`);
        return;
      }
    }
  }
}

function toDockPatch(fact: {
  activity: TuiRuntimeDockState["activity"];
  background?: string;
  subagent?: string;
}): Partial<TuiRuntimeDockState> {
  const patch: Partial<TuiRuntimeDockState> = {
    activity: fact.activity,
  };
  if ("background" in fact) {
    patch.background = fact.background;
  }
  if ("subagent" in fact) {
    patch.subagent = fact.subagent;
  }
  return patch;
}
