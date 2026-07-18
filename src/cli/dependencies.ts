import type { SessionStore } from "../session/index.js";
import type { resolveCliRuntime } from "./runtime.js";
import type { OneShotPromptRunResult } from "./oneShot.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";

export interface CliProgramDependencies {
  startLocalConsole?: (cwd: string) => Promise<{
    url: string;
    webUrl?: string;
    close(): Promise<void>;
    wait(): Promise<void>;
  }>;
  openBrowser?: (url: string) => boolean | Promise<boolean>;
  startInteractive?: (options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: SessionStore;
  }) => Promise<void>;
  startTui?: (options: {
    cwd: string;
    cwdOverridden?: boolean;
    config: RuntimeConfig;
    sessionStore: SessionStore;
  }) => Promise<void>;
  createTelegramService?: (options: {
    cwd: string;
    config: RuntimeConfig;
  }) => Promise<{
    run(signal?: AbortSignal): Promise<void>;
    stop?(): void;
  }>;
  createWeixinService?: (options: {
    cwd: string;
    config: RuntimeConfig;
  }) => Promise<{
    run(signal?: AbortSignal): Promise<void>;
    stop?(): void;
  }>;
  runOneShot?: (options: {
    prompt: string;
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: SessionStore;
  }) => Promise<OneShotPromptRunResult>;
  acquireProcessLock?: (options: { stateDir: string }) => Promise<{
    leaseName: string;
    signal?: AbortSignal;
    release(): Promise<void>;
  }>;
  resolveRuntime?: typeof resolveCliRuntime;
}
