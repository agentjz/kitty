import type { AgentCallbacks } from "../../agent/types.js";
import type { InteractionTurnDisplay } from "../../interaction/shell.js";
import type { TuiController } from "./controller.js";

export function createTuiTurnDisplay(options: {
  controller: TuiController;
  config: { showReasoning: boolean };
  abortSignal: AbortSignal;
}): InteractionTurnDisplay {
  let aborted = false;
  const isAborted = (): boolean => aborted || options.abortSignal.aborted;
  const updateWork = (active: boolean, label: string, detail: string): void => {
    if (!isAborted()) {
      options.controller.updateDock({
        work: {
          active,
          label,
          detail,
        },
      });
    }
  };

  options.abortSignal.addEventListener("abort", () => {
    aborted = true;
    updateWork(false, "已中断", "当前轮已中断");
  });

  const callbacks: AgentCallbacks = {
    onModelWaitStart() {
      updateWork(true, "思考中", "等待模型回复");
    },
    onModelWaitStop() {
      updateWork(false, "空闲", "模型等待结束");
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
      updateWork(false, "空闲", "回复完成");
    },
    onToolCall(name) {
      if (isAborted()) {
        return;
      }
      const lane = classifyToolLane(name);
      options.controller.updateDock({
        work: {
          active: true,
          label: "执行工具",
          detail: name,
        },
        ...lane,
      });
    },
    onToolResult(name) {
      if (isAborted()) {
        return;
      }
      const lane = classifyToolLane(name, "完成");
      options.controller.updateDock({
        work: {
          active: false,
          label: "工具完成",
          detail: name,
        },
        ...lane,
      });
    },
    onToolError(name, error) {
      if (isAborted()) {
        return;
      }
      const lane = classifyToolLane(name, "失败");
      options.controller.updateDock({
        work: {
          active: false,
          label: "工具失败",
          detail: `${name}: ${shorten(error)}`,
        },
        ...lane,
      });
      options.controller.append("system", `工具失败：${name}`);
    },
    onStatus(text) {
      if (isAborted()) {
        return;
      }
      options.controller.updateDock({
        work: {
          active: text.trim().length > 0,
          label: text.trim() ? "状态" : "空闲",
          detail: text.trim() || "空闲",
        },
      });
    },
  };

  return {
    callbacks,
    flush() {
      options.controller.updateDock({
        work: {
          active: false,
          label: "空闲",
          detail: "当前轮已收口",
        },
      });
    },
    dispose() {
      options.controller.updateDock({
        work: {
          active: false,
          label: "空闲",
          detail: "没有任务正在执行",
        },
      });
    },
  };
}

function classifyToolLane(
  name: string,
  suffix = "运行中",
): Partial<Parameters<TuiController["updateDock"]>[0]> {
  const normalized = name.toLowerCase();
  if (normalized.includes("background")) {
    return { background: `${name} ${suffix}` };
  }
  if (normalized.includes("subagent")) {
    return { subagent: `${name} ${suffix}` };
  }
  return {};
}

function shorten(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) {
    return normalized;
  }
  return `${normalized.slice(0, 77)}...`;
}
