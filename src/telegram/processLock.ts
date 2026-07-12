import path from "node:path";

import { ControlPlaneLedger } from "../control/ledger.js";
import { inspectProcessIdentity } from "../execution/process.js";
import type { ServiceLeaseRecord } from "../control/telegram.js";

export interface TelegramProcessLock {
  leaseName: string;
  signal: AbortSignal;
  release(): Promise<void>;
}

export async function acquireTelegramProcessLock(options: {
  stateDir: string;
  processId?: number;
}): Promise<TelegramProcessLock> {
  const processId = options.processId ?? process.pid;
  const rootDir = path.dirname(path.dirname(path.resolve(options.stateDir)));
  const ledger = new ControlPlaneLedger(rootDir);
  let lease: ServiceLeaseRecord;
  try {
    lease = ledger.serviceLeases.acquire({
      name: "telegram",
      processId,
      processIdentity: inspectProcessIdentity(processId),
    });
  } finally {
    ledger.close();
  }

  const heartbeat = setInterval(() => {
    const current = new ControlPlaneLedger(rootDir);
    try { lease = current.serviceLeases.heartbeat(lease); }
    catch (error) {
      clearInterval(heartbeat);
      leaseLost.abort(error);
    }
    finally { current.close(); }
  }, 10_000);
  heartbeat.unref();
  const leaseLost = new AbortController();
  let released = false;

  return {
    leaseName: lease.name,
    signal: leaseLost.signal,
    async release() {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      const current = new ControlPlaneLedger(rootDir);
      try { current.serviceLeases.release(lease); }
      finally { current.close(); }
    },
  };
}
