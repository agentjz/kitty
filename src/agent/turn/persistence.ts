import {
  noteCheckpointToolBatch,
  noteCheckpointTransition,
  noteCheckpointTurnInput,
} from "../../session/checkpoint.js";
import { createMessage } from "../../session/messages.js";
import { applyCurrentTurnFrame } from "../../session/taskState.js";
import type { SessionStoreLike } from "../../session/store.js";
import type { RuntimeTransition, SessionRecord, StoredMessage } from "../../types.js";

interface PersistToolBatchInput {
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  toolNames: string[];
  toolMessages: StoredMessage[];
  changedPaths: string[];
}

export async function initializeTurnSession(
  session: SessionRecord,
  input: string,
  sessionStore: SessionStoreLike,
  source: StoredMessage["source"] = "external",
  messageId?: string,
): Promise<SessionRecord> {
  const existing = messageId
    ? session.messages.some((message) => message.id === messageId)
    : false;
  const message = createMessage("user", input, { source });
  if (messageId) message.id = messageId;
  const appended = existing
    ? session
    : await sessionStore.appendMessages(session, [message]);

  const framed = applyCurrentTurnFrame(appended, input, undefined, source);

  return sessionStore.save(noteCheckpointTurnInput(framed, input));
}

export async function persistToolBatchCheckpoint(
  input: PersistToolBatchInput,
): Promise<SessionRecord> {
  return input.sessionStore.save(
    noteCheckpointToolBatch(input.session, {
      toolNames: input.toolNames,
      toolMessages: input.toolMessages,
      changedPaths: input.changedPaths,
    }),
  );
}

export async function persistCheckpointTransition(
  session: SessionRecord,
  sessionStore: SessionStoreLike,
  transition: RuntimeTransition,
): Promise<SessionRecord> {
  return sessionStore.save(noteCheckpointTransition(session, transition));
}
