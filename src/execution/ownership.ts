import { AsyncLocalStorage } from "node:async_hooks";

import { ControlPlaneLedger } from "../control/ledger.js";

export interface ExecutionOwnership {
  rootDir: string;
  executionId: string;
  ownerToken: string;
}

const executionOwnership = new AsyncLocalStorage<ExecutionOwnership>();

export function runWithExecutionOwnership<T>(
  ownership: ExecutionOwnership,
  operation: () => Promise<T>,
): Promise<T> {
  return executionOwnership.run(ownership, operation);
}

export function assertActiveExecutionOwnership(): void {
  const ownership = executionOwnership.getStore();
  if (!ownership) return;
  const ledger = new ControlPlaneLedger(ownership.rootDir);
  try {
    ledger.executions.assertOwner(ownership.executionId, ownership.ownerToken);
  } finally {
    ledger.close();
  }
}
