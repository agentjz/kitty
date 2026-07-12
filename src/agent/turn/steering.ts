import { SessionRevisionConflictError } from "../../control/sessions.js";
import { ControlPlaneLedger } from "../../control/ledger.js";
import { noteCheckpointTurnInput } from "../../session/checkpoint.js";
import { applyCurrentTurnFrame } from "../../session/taskState.js";
import type { SessionStoreLike } from "../../session/store.js";
import type { SessionRecord, StoredMessage } from "../../types.js";
import type { TurnSteerRecord } from "../../control/turnSteers.js";

export interface ConsumedTurnSteers {
  session: SessionRecord;
  steers: TurnSteerRecord[];
}

export async function consumePendingTurnSteers(input: {
  rootDir: string;
  turnId: string;
  ownerToken: string;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
}): Promise<ConsumedTurnSteers> {
  const reader = new ControlPlaneLedger(input.rootDir);
  let pending: TurnSteerRecord[];
  try {
    pending = reader.turnSteers.listPending(input.turnId);
  } finally {
    reader.close();
  }
  if (pending.length === 0) return { session: input.session, steers: [] };

  let session = input.session;
  const consumed: TurnSteerRecord[] = [];
  for (const steer of pending) {
    session = await persistSteerMessage({
      session,
      sessionStore: input.sessionStore,
      steer,
    });
    const ledger = new ControlPlaneLedger(input.rootDir);
    try {
      consumed.push(ledger.turnSteers.markConsumed({
        steerId: steer.id,
        turnId: input.turnId,
        ownerToken: input.ownerToken,
      }));
    } finally {
      ledger.close();
    }
  }
  return { session, steers: consumed };
}

async function persistSteerMessage(input: {
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  steer: TurnSteerRecord;
}): Promise<SessionRecord> {
  let candidate = input.session;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = candidate.messages.some((message) => message.id === input.steer.messageId);
    if (existing) return candidate;

    const message: StoredMessage = {
      id: input.steer.messageId,
      role: "user",
      content: input.steer.input,
      source: "external",
      createdAt: input.steer.createdAt,
    };
    const withMessage = {
      ...candidate,
      messages: [...candidate.messages, message],
    };
    const framed = applyCurrentTurnFrame(withMessage, input.steer.input, input.steer.createdAt, "external");
    try {
      return await input.sessionStore.save(noteCheckpointTurnInput(framed, input.steer.input));
    } catch (error) {
      if (!(error instanceof SessionRevisionConflictError)) throw error;
      candidate = await input.sessionStore.load(candidate.id);
    }
  }
  throw new Error(`Could not persist steer ${input.steer.id} after session revision conflicts.`);
}
