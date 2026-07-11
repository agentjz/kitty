import { AsyncLocalStorage } from "node:async_hooks";

import { ControlPlaneLedger } from "./ledger.js";

export interface TurnOwnership {
  rootDir: string;
  sessionId: string;
  turnId: string;
  ownerToken: string;
}

const storage = new AsyncLocalStorage<TurnOwnership>();

export function runWithTurnOwnership<T>(ownership: TurnOwnership, operation: () => Promise<T>): Promise<T> {
  return storage.run(ownership, operation);
}

export function assertActiveTurnOwnership(sessionId?: string): void {
  const ownership = storage.getStore();
  if (!ownership || (sessionId && ownership.sessionId !== sessionId)) return;
  const ledger = new ControlPlaneLedger(ownership.rootDir);
  try {
    ledger.turns.assertOwner(ownership.turnId, ownership.ownerToken);
  } finally {
    ledger.close();
  }
}
