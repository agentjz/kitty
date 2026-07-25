import { createDefaultAgentToolRegistry } from "../tools/registry.js";
import { createRuntimeToolRegistry } from "../tools/core/runtimeRegistry.js";
import { createToolSource } from "../tools/core/sources.js";
import type { RegisteredTool, ToolRegistry } from "../tools/index.js";
import type { ToolFilter } from "../tools/core/types.js";
import type { RuntimeConfig } from "../types.js";

export interface HostToolRegistryOptions {
  builtinToolFilter?: ToolFilter;
  extraTools?: readonly RegisteredTool[];
  cwd?: string;
  stateRootDir?: string;
}

export async function createHostToolRegistry(
  config: RuntimeConfig,
  options: HostToolRegistryOptions = {},
): Promise<ToolRegistry> {
  const extraTools = options.extraTools ?? [];
  if (extraTools.length === 0 && !options.builtinToolFilter) {
    return createDefaultAgentToolRegistry(config, {
      cwd: options.cwd,
      stateRootDir: options.stateRootDir,
    });
  }
  const capabilityRegistry = await createDefaultAgentToolRegistry(config, {
    cwd: options.cwd,
    stateRootDir: options.stateRootDir,
  });
  const capabilitySources = (capabilityRegistry.entries ?? [])
    .filter((entry) => entry.origin.kind === "host")
    .map((entry) => createToolSource("host", entry.origin.sourceId ?? "capability", [entry.tool]));
  const enabledBuiltinNames = (capabilityRegistry.entries ?? [])
    .filter((entry) => entry.origin.kind === "builtin")
    .filter((entry) => options.builtinToolFilter?.(entry.tool) ?? true)
    .map((entry) => entry.name);
  try {
    return await createRuntimeToolRegistry(config, {
      onlyNames: [
        ...enabledBuiltinNames,
        ...capabilitySources.flatMap((source) => source.tools.map((tool) => tool.definition.function.name)),
        ...extraTools.map((tool) => tool.definition.function.name),
      ],
      builtinToolFilter: (tool) => enabledBuiltinNames.includes(tool.definition.function.name),
      sources: [...capabilitySources, createToolSource("host", "host:extra-tools", extraTools)],
    }, {
      close: async () => capabilityRegistry.close?.(),
    });
  } catch (error) {
    await capabilityRegistry.close?.();
    throw error;
  }
}
