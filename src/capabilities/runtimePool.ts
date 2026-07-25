import path from "node:path";

import type { ToolRegistrySource } from "../tools/core/types.js";
import type { RuntimeConfig } from "../types.js";
import { CapabilityManager, type CapabilityManagerDependencies } from "./manager.js";

interface RuntimeEntry {
  manager: CapabilityManager;
  borrows: number;
  readonly drainWaiters: Set<() => void>;
}

export interface CapabilityRuntimeBorrow {
  manager: CapabilityManager;
  sources: ToolRegistrySource[];
  toolNames: string[];
  release(): void;
}

const runtimes = new Map<string, RuntimeEntry>();
const transitions = new Map<string, Promise<void>>();
let hooksRegistered = false;
let closeAllPromise: Promise<void> | undefined;

export async function acquireProjectCapabilityRuntime(input: {
  cwd: string;
  stateRootDir: string;
  config: RuntimeConfig;
  dependencies?: CapabilityManagerDependencies;
}): Promise<CapabilityRuntimeBorrow> {
  registerProcessHooks();
  const key = path.resolve(input.stateRootDir);
  const entry = await borrowRuntimeEntry(key, input);
  try {
    const contribution = await entry.manager.contributeTools();
    let released = false;
    return {
      manager: entry.manager,
      ...contribution,
      release() {
        if (released) return;
        released = true;
        releaseRuntimeEntry(entry);
      },
    };
  } catch (error) {
    releaseRuntimeEntry(entry);
    throw error;
  }
}

export async function withProjectCapabilityManager<T>(input: {
  cwd: string;
  stateRootDir: string;
  config: RuntimeConfig;
  dependencies?: CapabilityManagerDependencies;
}, operation: (manager: CapabilityManager) => Promise<T>): Promise<T> {
  registerProcessHooks();
  const key = path.resolve(input.stateRootDir);
  const entry = await borrowRuntimeEntry(key, input);
  try {
    return await operation(entry.manager);
  } finally {
    releaseRuntimeEntry(entry);
  }
}

export async function getProjectCapabilityManager(input: {
  cwd: string;
  stateRootDir: string;
  config: RuntimeConfig;
  dependencies?: CapabilityManagerDependencies;
}): Promise<CapabilityManager> {
  registerProcessHooks();
  const key = path.resolve(input.stateRootDir);
  return withTransition(key, async () => ensureRuntimeEntry(key, input).manager);
}

export async function replaceProjectCapabilityRuntime(input: {
  cwd: string;
  stateRootDir: string;
  config: RuntimeConfig;
  dependencies?: CapabilityManagerDependencies;
}): Promise<CapabilityManager> {
  registerProcessHooks();
  const key = path.resolve(input.stateRootDir);
  return withTransition(key, async () => {
    const current = runtimes.get(key);
    if (current) {
      await waitForBorrows(current);
      await current.manager.close();
      if (runtimes.get(key) === current) runtimes.delete(key);
    }
    const next = ensureRuntimeEntry(key, input);
    await next.manager.reconcileEnabledRuntimes();
    return next.manager;
  });
}

export async function closeProjectCapabilityRuntime(stateRootDir: string): Promise<void> {
  const key = path.resolve(stateRootDir);
  await withTransition(key, async () => {
    const entry = runtimes.get(key);
    if (!entry) return;
    await entry.manager.close();
    if (runtimes.get(key) === entry) runtimes.delete(key);
  });
}

export async function closeAllProjectCapabilityRuntimes(): Promise<void> {
  const keys = [...runtimes.keys()];
  const results = await Promise.allSettled(keys.map((key) => closeProjectCapabilityRuntime(key)));
  const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  if (errors.length > 0) throw new AggregateError(errors, "Project capability runtime cleanup was incomplete.");
}

function registerProcessHooks(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;
  process.on("beforeExit", () => {
    if (closeAllPromise || runtimes.size === 0) return;
    closeAllPromise = closeAllProjectCapabilityRuntimes()
      .catch(() => undefined)
      .finally(() => { closeAllPromise = undefined; });
  });
  process.on("exit", () => {
    for (const entry of runtimes.values()) entry.manager.forceCleanupSync();
  });
}

function ensureRuntimeEntry(
  key: string,
  input: {
    cwd: string;
    stateRootDir: string;
    config: RuntimeConfig;
    dependencies?: CapabilityManagerDependencies;
  },
): RuntimeEntry {
  let entry = runtimes.get(key);
  if (!entry) {
    entry = {
      manager: new CapabilityManager(input.cwd, input.stateRootDir, input.config, input.dependencies),
      borrows: 0,
      drainWaiters: new Set(),
    };
    runtimes.set(key, entry);
  }
  return entry;
}

async function borrowRuntimeEntry(
  key: string,
  input: {
    cwd: string;
    stateRootDir: string;
    config: RuntimeConfig;
    dependencies?: CapabilityManagerDependencies;
  },
): Promise<RuntimeEntry> {
  return withTransition(key, async () => {
    const entry = ensureRuntimeEntry(key, input);
    entry.borrows += 1;
    return entry;
  });
}

function releaseRuntimeEntry(entry: RuntimeEntry): void {
  entry.borrows = Math.max(0, entry.borrows - 1);
  if (entry.borrows !== 0) return;
  for (const resolve of entry.drainWaiters) resolve();
  entry.drainWaiters.clear();
}

async function waitForBorrows(entry: RuntimeEntry): Promise<void> {
  if (entry.borrows === 0) return;
  await new Promise<void>((resolve) => entry.drainWaiters.add(resolve));
}

async function withTransition<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = transitions.get(key) ?? Promise.resolve();
  let resolveCurrent!: () => void;
  const current = new Promise<void>((resolve) => { resolveCurrent = resolve; });
  transitions.set(key, current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    resolveCurrent();
    if (transitions.get(key) === current) transitions.delete(key);
  }
}
