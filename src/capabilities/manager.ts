import { ControlPlaneLedger } from "../control/ledger.js";
import { createToolSource } from "../tools/core/sources.js";
import { getBuiltinToolNames } from "../tools/toolCatalog.js";
import type { LoadedSkill, RuntimeConfig } from "../types.js";
import {
  BUILTIN_CAPABILITY_ADAPTERS,
  CORE_CAPABILITY,
  createSkillCapabilityDefinition,
  getStaticCapabilityDefinition,
  PLAYWRIGHT_CAPABILITY,
  STATIC_CAPABILITY_DEFINITIONS,
  WEB_CAPABILITY,
} from "./definitions.js";
import { PlaywrightMcpRuntime, type PlaywrightMcpDependencies } from "./playwrightMcp.js";
import type { CapabilityDefinition, CapabilitySnapshot, CapabilityToolContribution } from "./types.js";
import { createWebTools, type WebDependencies } from "./web.js";

export interface CapabilityManagerDependencies {
  playwright?: PlaywrightMcpDependencies;
  web?: WebDependencies;
}

export class CapabilityManager {
  private readonly playwright: PlaywrightMcpRuntime;
  private readonly discovered = new Map<string, CapabilityDefinition>();

  constructor(
    private readonly cwd: string,
    private readonly stateRootDir: string,
    private readonly config: RuntimeConfig,
    private readonly dependencies: CapabilityManagerDependencies = {},
  ) {
    this.playwright = new PlaywrightMcpRuntime(cwd, stateRootDir, config, dependencies.playwright);
    const ledger = new ControlPlaneLedger(stateRootDir);
    try {
      for (const definition of STATIC_CAPABILITY_DEFINITIONS) ledger.capabilities.ensure(definition);
    } finally {
      ledger.close();
    }
  }

  discoverSkills(skills: readonly LoadedSkill[]): CapabilityDefinition[] {
    const definitions = skills.map((skill) => createSkillCapabilityDefinition(skill));
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      for (const definition of definitions) {
        this.discovered.set(definition.id, definition);
        const state = ledger.capabilities.ensure(definition);
        ledger.capabilities.updateHealth({
          id: definition.id,
          status: skillStatus(skills.find((skill) => `skill:${skill.name}` === definition.id)?.health.status),
          message: skills.find((skill) => `skill:${skill.name}` === definition.id)?.health.issues.join("; ") || undefined,
        });
        if (!state.enabled) ledger.capabilities.updateHealth({ id: definition.id, status: "disabled" });
      }
    } finally {
      ledger.close();
    }
    return definitions;
  }

  async contributeTools(): Promise<CapabilityToolContribution> {
    const sources: CapabilityToolContribution["sources"] = [];
    const toolNames: string[] = [];
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      const core = ledger.capabilities.ensure(CORE_CAPABILITY);
      if (core.enabled) {
        ledger.capabilities.updateHealth({ id: core.id, status: "ready" });
        toolNames.push(...getBuiltinToolNames());
      } else {
        ledger.capabilities.updateHealth({ id: core.id, status: "disabled" });
      }
      for (const adapter of BUILTIN_CAPABILITY_ADAPTERS) {
        const state = ledger.capabilities.ensure(adapter.definition);
        if (!state.enabled) {
          ledger.capabilities.updateHealth({ id: state.id, status: "disabled" });
          continue;
        }
        const missingConfig = missingCapabilityConfig(adapter.definition, this.config);
        if (missingConfig.length > 0) {
          ledger.capabilities.updateHealth({
            id: state.id,
            status: "needs_config",
            message: `${missingConfig.join(", ")} ${missingConfig.length === 1 ? "is" : "are"} required.`,
          });
          continue;
        }
        const tools = adapter.createTools();
        ledger.capabilities.updateHealth({ id: state.id, status: "ready" });
        sources.push(createToolSource("host", `capability:${state.id}`, tools));
        toolNames.push(...tools.map((tool) => tool.definition.function.name));
      }

      const webState = ledger.capabilities.ensure(WEB_CAPABILITY);
      if (!webState.enabled) {
        ledger.capabilities.updateHealth({ id: webState.id, status: "disabled" });
      } else {
        const tools = createWebTools(this.dependencies.web);
        ledger.capabilities.updateHealth({ id: webState.id, status: "ready" });
        sources.push(createToolSource("host", "capability:web", tools));
        toolNames.push(...tools.map((tool) => tool.definition.function.name));
      }
    } finally {
      ledger.close();
    }

    const playwrightState = this.readState(PLAYWRIGHT_CAPABILITY);
    if (playwrightState.enabled) {
      try {
        const tools = await this.playwright.start();
        sources.push(createToolSource("host", "capability:playwright", tools));
        toolNames.push(...tools.map((tool) => tool.definition.function.name));
      } catch {
        // The runtime persisted the degraded health and cleanup facts.
      }
    }
    return { sources, toolNames };
  }

  snapshot(skills: readonly LoadedSkill[] = []): CapabilitySnapshot[] {
    const skillDefinitions = this.discoverSkills(skills);
    const definitions = [...STATIC_CAPABILITY_DEFINITIONS, ...skillDefinitions];
    const toolNamesByCapability = new Map<string, string[]>();
    toolNamesByCapability.set(CORE_CAPABILITY.id, getBuiltinToolNames());
    for (const adapter of BUILTIN_CAPABILITY_ADAPTERS) {
      toolNamesByCapability.set(adapter.definition.id, adapter.createTools().map((tool) => tool.definition.function.name));
    }
    toolNamesByCapability.set(WEB_CAPABILITY.id, ["web_search", "web_fetch", "web_download"]);
    toolNamesByCapability.set(PLAYWRIGHT_CAPABILITY.id, this.playwright.getToolNames());
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      for (const definition of STATIC_CAPABILITY_DEFINITIONS) {
        const state = ledger.capabilities.ensure(definition);
        if (!state.enabled) {
          ledger.capabilities.updateHealth({ id: definition.id, status: "disabled" });
        } else if (missingCapabilityConfig(definition, this.config).length > 0) {
          const missingConfig = missingCapabilityConfig(definition, this.config);
          ledger.capabilities.updateHealth({
            id: definition.id,
            status: "needs_config",
            message: `${missingConfig.join(", ")} ${missingConfig.length === 1 ? "is" : "are"} required.`,
          });
        } else if (definition.kind === "core" || definition.kind === "builtin") {
          ledger.capabilities.updateHealth({ id: definition.id, status: "ready" });
        } else if (definition.kind === "web") {
          const current = ledger.capabilities.load(definition.id)!;
          if (["stopped", "starting", "needs_config"].includes(current.status)) {
            ledger.capabilities.updateHealth({ id: definition.id, status: "ready" });
          }
        }
      }
      return definitions.map((definition) => {
        const state = ledger.capabilities.load(definition.id)!;
        return {
          ...definition,
          enabled: state.enabled,
          status: state.enabled ? state.status : "disabled",
          message: state.healthMessage,
          operationId: state.operationId,
          ownerGeneration: state.ownerGeneration,
          heartbeatAt: state.heartbeatAt,
          leaseExpiresAt: state.leaseExpiresAt,
          toolNames: toolNamesByCapability.get(definition.id) ?? [],
          updatedAt: state.updatedAt,
        };
      });
    } finally {
      ledger.close();
    }
  }

  async setEnabled(id: string, enabled: boolean, skills: readonly LoadedSkill[] = []): Promise<CapabilitySnapshot> {
    this.discoverSkills(skills);
    const definition = getStaticCapabilityDefinition(id) ?? this.discovered.get(id);
    if (!definition) throw new Error(`Unknown capability: ${id}.`);
    if (!enabled && id === PLAYWRIGHT_CAPABILITY.id) await this.playwright.prepareDisable();
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      ledger.capabilities.setEnabled(definition, enabled);
    } finally {
      ledger.close();
    }
    if (enabled && id === PLAYWRIGHT_CAPABILITY.id) await this.playwright.start().catch(() => undefined);
    return this.snapshot(skills).find((item) => item.id === id)!;
  }

  async reconcileEnabledRuntimes(): Promise<void> {
    const playwright = this.readState(PLAYWRIGHT_CAPABILITY);
    if (!playwright.enabled) return;
    await this.playwright.start().catch(() => undefined);
  }

  isEnabled(id: string, fallback = true): boolean {
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      return ledger.capabilities.load(id)?.enabled ?? fallback;
    } finally {
      ledger.close();
    }
  }

  filterEnabledSkills(skills: readonly LoadedSkill[]): LoadedSkill[] {
    this.discoverSkills(skills);
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      if (ledger.capabilities.load("skills")?.enabled === false) return [];
      return skills.filter((skill) => ledger.capabilities.load(`skill:${skill.name}`)?.enabled !== false);
    } finally {
      ledger.close();
    }
  }

  removeSkill(name: string): void {
    const id = `skill:${name}`;
    this.discovered.delete(id);
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      ledger.capabilities.removeSkill(id);
    } finally {
      ledger.close();
    }
  }

  async close(): Promise<void> {
    await this.playwright.close();
  }

  forceCleanupSync(): void {
    this.playwright.forceCleanupSync();
  }

  private readState(definition: CapabilityDefinition) {
    const ledger = new ControlPlaneLedger(this.stateRootDir);
    try {
      return ledger.capabilities.ensure(definition);
    } finally {
      ledger.close();
    }
  }
}

function skillStatus(status: LoadedSkill["health"]["status"] | undefined): "ready" | "degraded" {
  return status === "ready" ? "ready" : "degraded";
}

function missingCapabilityConfig(definition: CapabilityDefinition, config: RuntimeConfig): string[] {
  return definition.requiredConfigKeys.filter((key) => {
    if (key === "KITTY_MEDIA_API_KEY") return !config.media.apiKey.trim();
    return true;
  });
}
