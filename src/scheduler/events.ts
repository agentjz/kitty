import { EventEmitter } from "node:events";

import type { ScheduledTaskRecord, ScheduledTriggerRecord } from "./types.js";

export interface SchedulerEvent {
  type: "task_changed" | "trigger_settled";
  task?: ScheduledTaskRecord;
  trigger?: ScheduledTriggerRecord;
}

const emitter = new EventEmitter();

export function publishSchedulerEvent(event: SchedulerEvent): void {
  emitter.emit("event", event);
}

export function subscribeSchedulerEvents(listener: (event: SchedulerEvent) => void): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}
