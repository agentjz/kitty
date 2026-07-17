import { acquireRemoteProcessLock } from "../remote/processLock.js";

export interface TelegramProcessLock {
  leaseName: string;
  signal: AbortSignal;
  release(): Promise<void>;
}

export async function acquireTelegramProcessLock(options: {
  stateDir: string;
  processId?: number;
}): Promise<TelegramProcessLock> {
  return acquireRemoteProcessLock({ host: "telegram", ...options });
}
