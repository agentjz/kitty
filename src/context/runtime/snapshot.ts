import { buildSessionConversationBrief } from "./sessionBrief/index.js";
import { buildAgentWorkingMemory } from "./workingMemory/index.js";
import type { BuildContextRuntimeSnapshotInput, ContextRuntimeSnapshot } from "./types.js";

export function buildContextRuntimeSnapshot(
  input: BuildContextRuntimeSnapshotInput,
): ContextRuntimeSnapshot {
  return {
    sessionBrief: buildSessionConversationBrief({
      messages: input.session.messages,
      sessionMemory: input.session.sessionMemory,
    }),
    workingMemory: buildAgentWorkingMemory({
      taskState: input.session.taskState,
      todoItems: input.session.todoItems,
      checkpoint: input.session.checkpoint,
    }),
    historyBoundary: {
      rawHistoryPolicy: "evidence_lookup_only",
      automaticSurfaces: [
        "internal continuity state",
        "current-objective working memory",
      ],
    },
  };
}
