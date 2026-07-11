import type { ChangeStore } from "../changes/store.js";
import { createToolRegistry } from "../../tools/index.js";
import type { ToolRegistry } from "../../tools/core/types.js";
import type {
  ProjectContext,
  SessionRecord,
  ToolCallRecord,
  ToolExecutionResult,
} from "../../types.js";
import type { RunTurnOptions } from "../types.js";
import { executeToolCallWithRecovery } from "./toolExecutor.js";

interface BatchExecutionItem {
  toolCall: ToolCallRecord;
  result: ToolExecutionResult;
  durationMs: number;
}

export interface ExecuteToolBatchResult {
  session: SessionRecord;
  items: BatchExecutionItem[];
}

export async function executeToolBatch(
  params: {
    session: SessionRecord;
    toolCalls: ToolCallRecord[];
    toolRegistry: ToolRegistry;
    options: RunTurnOptions;
    projectContext: ProjectContext;
    changeStore: ChangeStore;
  },
): Promise<ExecuteToolBatchResult> {
  const items: BatchExecutionItem[] = [];
  const entryByName = new Map((params.toolRegistry.entries ?? []).map((entry) => [entry.name, entry]));
  let saveQueue: Promise<unknown> = Promise.resolve();
  const persistSession = (session: SessionRecord): Promise<void> => {
    const snapshot = structuredClone(session);
    saveQueue = saveQueue.then(() => params.options.sessionStore.save(snapshot));
    return saveQueue.then(() => undefined);
  };

  for (let index = 0; index < params.toolCalls.length;) {
    const toolCall = params.toolCalls[index];
    if (!toolCall) {
      break;
    }
    if (isParallelRead(toolCall.function.name, entryByName)) {
      const group: ToolCallRecord[] = [];
      while (index < params.toolCalls.length) {
        const candidate = params.toolCalls[index];
        if (!candidate || !isParallelRead(candidate.function.name, entryByName)) {
          break;
        }
        group.push(candidate);
        index += 1;
      }
      items.push(...await Promise.all(group.map((call) => executeOne(call, persistSession, params))));
      continue;
    }

    items.push(await executeOne(toolCall, persistSession, params));
    index += 1;
  }

  await saveQueue;
  params.session = await params.options.sessionStore.save(params.session);

  return {
    session: params.session,
    items,
  };
}

async function executeOne(
  toolCall: ToolCallRecord,
  persistSession: (session: SessionRecord) => Promise<void>,
  params: {
    session: SessionRecord;
    toolRegistry: ToolRegistry;
    options: RunTurnOptions;
    projectContext: ProjectContext;
    changeStore: ChangeStore;
  },
): Promise<BatchExecutionItem> {
  const startedAt = Date.now();
  const result = await executeToolCallWithRecovery(
    params.toolRegistry as ReturnType<typeof createToolRegistry>,
    toolCall,
    params.options,
    params.session,
    params.projectContext,
    params.changeStore,
    persistSession,
  );
  return {
    toolCall,
    result,
    durationMs: Date.now() - startedAt,
  };
}

function isParallelRead(
  toolName: string,
  entries: ReadonlyMap<string, NonNullable<ToolRegistry["entries"]>[number]>,
): boolean {
  const entry = entries.get(toolName);
  return entry?.effect === "read" && entry.parallelSafe;
}
