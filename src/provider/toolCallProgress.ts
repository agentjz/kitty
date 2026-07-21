import type { AgentCallbacks, ToolCallProgress } from "../agent/types.js";

export interface StreamingToolCallState {
  id: string;
  name: string;
  arguments: string;
  argumentBytesReceived: number;
  providerMetadata?: Record<string, unknown>;
}

export function appendToolCallArguments(state: StreamingToolCallState, delta: string): void {
  state.arguments += delta;
  state.argumentBytesReceived += Buffer.byteLength(delta, "utf8");
}

export function replaceToolCallArguments(state: StreamingToolCallState, value: string): void {
  state.arguments = value;
  state.argumentBytesReceived = Math.max(
    state.argumentBytesReceived,
    Buffer.byteLength(value, "utf8"),
  );
}

export function createToolCallProgressReporter(callbacks: AgentCallbacks | undefined): {
  report(index: number, state: StreamingToolCallState): void;
} {
  const lastReported = new Map<number, { bytes: number; id: string; name: string }>();

  return {
    report(index, state) {
      if (!callbacks?.onToolCallProgress || state.name.length === 0 || state.argumentBytesReceived === 0) {
        return;
      }

      const previous = lastReported.get(index);
      const identityChanged = previous?.id !== state.id || previous?.name !== state.name;
      if (previous && !identityChanged && previous.bytes >= state.argumentBytesReceived) {
        return;
      }
      const progress: ToolCallProgress = {
        index,
        id: state.id,
        name: state.name,
        argumentBytesReceived: state.argumentBytesReceived,
      };
      lastReported.set(index, {
        bytes: progress.argumentBytesReceived,
        id: progress.id,
        name: progress.name,
      });
      callbacks.onToolCallProgress(progress);
    },
  };
}
