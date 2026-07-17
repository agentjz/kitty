import { acquireRemoteProcessLock } from "../remote/processLock.js";

export function acquireWeixinProcessLock(options: { stateDir: string; processId?: number }) {
  return acquireRemoteProcessLock({ host: "weixin", ...options });
}
