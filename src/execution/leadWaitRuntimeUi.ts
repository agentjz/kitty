import type { AgentCallbacks } from "../agent/types.js";
import { RUNTIME_UI_EVENT_PROTOCOL, type RuntimeUiEvent } from "../runtime-ui/events.js";
import { SessionEventStore } from "../session/events.js";
import type { ExecutionRecord } from "./store.js";

export function createLeadWaitRuntimeUiStreamer(input: {
  events: SessionEventStore;
  callbacks?: AgentCallbacks;
}): (executions: readonly ExecutionRecord[]) => Promise<void> {
  const seenEventIds = new Set<string>();
  return async (executions) => {
    if (!input.callbacks?.onRuntimeUiEvent) {
      return;
    }
    for (const execution of executions) {
      if (!execution.sessionId) {
        continue;
      }
      const events = await input.events.list(execution.sessionId, 200);
      for (const event of events) {
        if (seenEventIds.has(event.id)) {
          continue;
        }
        seenEventIds.add(event.id);
        if (event.type !== "runtime.ui") {
          continue;
        }
        const runtimeUiEvent = readRuntimeUiEvent(event.details?.runtimeUiEvent);
        if (runtimeUiEvent) {
          input.callbacks.onRuntimeUiEvent(runtimeUiEvent);
        }
      }
    }
  };
}

function readRuntimeUiEvent(value: unknown): RuntimeUiEvent | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const event = value as Partial<RuntimeUiEvent>;
  if (event.protocol !== RUNTIME_UI_EVENT_PROTOCOL || !event.channel || !event.kind || !event.createdAt) {
    return undefined;
  }
  return event as RuntimeUiEvent;
}
