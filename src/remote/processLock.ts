import path from "node:path";

import { ControlPlaneLedger } from "../control/ledger.js";
import type { ServiceLeaseRecord } from "../control/serviceLeases.js";
import { inspectProcessIdentity } from "../execution/process.js";

export async function acquireRemoteProcessLock(options: {
  host: string;
  stateDir: string;
  processId?: number;
}): Promise<{ leaseName: string; signal: AbortSignal; release(): Promise<void> }> {
  const processId = options.processId ?? process.pid;
  const rootDir = path.dirname(path.dirname(path.resolve(options.stateDir)));
  const ledger = new ControlPlaneLedger(rootDir);
  let lease: ServiceLeaseRecord;
  try {
    lease = ledger.serviceLeases.acquire({ name: options.host, processId, processIdentity: inspectProcessIdentity(processId) });
  } finally { ledger.close(); }
  const lost = new AbortController();
  const heartbeat = setInterval(() => {
    const current = new ControlPlaneLedger(rootDir);
    try { lease = current.serviceLeases.heartbeat(lease); }
    catch (error) { clearInterval(heartbeat); lost.abort(error); }
    finally { current.close(); }
  }, 10_000);
  heartbeat.unref();
  let released = false;
  return {
    leaseName: lease.name,
    signal: lost.signal,
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
