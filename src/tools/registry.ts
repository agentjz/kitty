import path from "node:path";

import { createRuntimeToolRegistry } from "./core/runtimeRegistry.js";
import { acquireProjectCapabilityRuntime } from "../capabilities/index.js";
import type { RuntimeConfig } from "../types.js";

export async function createDefaultAgentToolRegistry(config: RuntimeConfig, input: {
  cwd?: string;
  stateRootDir?: string;
} = {}) {
  const cwd = input.cwd ?? path.dirname(config.paths.dataDir);
  const stateRootDir = input.stateRootDir ?? cwd;
  const runtime = await acquireProjectCapabilityRuntime({ cwd, stateRootDir, config });

  return createRuntimeToolRegistry(config, {
    onlyNames: runtime.toolNames,
    sources: runtime.sources,
  }, {
    close: async () => runtime.release(),
  });
}
