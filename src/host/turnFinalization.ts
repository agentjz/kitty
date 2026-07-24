import { ControlPlaneLedger } from "../control/ledger.js";
import type { SessionRecord } from "../types.js";

export type FinalizableTurnStatus = "completed" | "failed" | "aborted";

export interface OwnedTurnFinalization {
  rootDir: string;
  session: SessionRecord;
  turnId: string;
  ownerToken: string;
  ownerGeneration: number;
  status: FinalizableTurnStatus;
  error?: string;
}

export function finalizeOwnedTurn(input: OwnedTurnFinalization): SessionRecord {
  const ledger = new ControlPlaneLedger(input.rootDir);
  try {
    return ledger.transaction(() => {
      const committedSession = ledger.sessions.saveOwned({
        session: input.session,
        turnId: input.turnId,
        ownerToken: input.ownerToken,
        ownerGeneration: input.ownerGeneration,
      });
      if (input.status === "aborted" || input.status === "failed") {
        ledger.turnSteers.rejectPending(
          input.turnId,
          input.status === "aborted" ? "The current turn was interrupted." : "The current turn failed.",
        );
      }
      ledger.turns.finish(
        input.turnId,
        input.ownerToken,
        input.ownerGeneration,
        input.status,
        input.error,
      );
      return committedSession;
    });
  } finally {
    ledger.close();
  }
}

export function loadLatestTurnSession(rootDir: string, sessionId: string, fallback: SessionRecord): SessionRecord {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    return ledger.sessions.load(sessionId) ?? fallback;
  } finally {
    ledger.close();
  }
}
