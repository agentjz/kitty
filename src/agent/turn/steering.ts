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
  ownerGeneration: number;
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
    const committed = await persistAndConsumeSteer({
      rootDir: input.rootDir,
      turnId: input.turnId,
      ownerToken: input.ownerToken,
      ownerGeneration: input.ownerGeneration,
      session,
      steer,
    });
    session = committed.session;
    consumed.push(committed.steer);
  }
  return { session, steers: consumed };
}

async function persistAndConsumeSteer(input: {
  rootDir: string;
  turnId: string;
  ownerToken: string;
  ownerGeneration: number;
  session: SessionRecord;
  steer: TurnSteerRecord;
}): Promise<{ session: SessionRecord; steer: TurnSteerRecord }> {
  let candidate = input.session;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = candidate.messages.some((message) => message.id === input.steer.messageId);
    const ledger = new ControlPlaneLedger(input.rootDir);
    if (existing) {
      try {
        const consumed = ledger.transaction(() => ledger.turnSteers.markConsumed({
          steerId: input.steer.id,
          turnId: input.turnId,
          ownerToken: input.ownerToken,
          ownerGeneration: input.ownerGeneration,
        }));
        return { session: candidate, steer: consumed };
      } finally {
        ledger.close();
      }
    }

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
      return ledger.transaction(() => {
        const session = ledger.sessions.saveOwned({
          session: noteCheckpointTurnInput(framed, input.steer.input),
          turnId: input.turnId,
          ownerToken: input.ownerToken,
          ownerGeneration: input.ownerGeneration,
        });
        const steer = ledger.turnSteers.markConsumed({
          steerId: input.steer.id,
          turnId: input.turnId,
          ownerToken: input.ownerToken,
          ownerGeneration: input.ownerGeneration,
        });
        return { session, steer };
      });
    } catch (error) {
      if (!(error instanceof SessionRevisionConflictError)) throw error;
      candidate = ledger.sessions.load(candidate.id)!;
    } finally {
      ledger.close();
    }
  }
  throw new Error(`Could not persist steer ${input.steer.id} after session revision conflicts.`);
}
