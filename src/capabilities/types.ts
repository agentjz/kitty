import type { LoadedSkill } from "../types.js";
import type { RegisteredTool, ToolRegistrySource } from "../tools/core/types.js";

export type CapabilityKind = "core" | "builtin" | "skill" | "mcp" | "web";
export type CapabilityInstallationSource = "bundled" | "project" | "npm";

export type CapabilityHealthStatus =
  | "disabled"
  | "needs_config"
  | "starting"
  | "ready"
  | "degraded"
  | "stopped";

export interface CapabilityDefinition {
  id: string;
  kind: CapabilityKind;
  version: string;
  label: string;
  summary: string;
  installed: boolean;
  installationSource: CapabilityInstallationSource;
  defaultEnabled: boolean;
  canDisable: boolean;
  requiredConfigKeys: readonly string[];
}

export interface CapabilitySnapshot extends CapabilityDefinition {
  enabled: boolean;
  status: CapabilityHealthStatus;
  message?: string;
  operationId?: string;
  ownerGeneration: number;
  heartbeatAt?: string;
  leaseExpiresAt?: string;
  toolNames: string[];
  updatedAt: string;
}

export interface BuiltinToolCapabilityAdapter {
  kind: "builtin";
  definition: CapabilityDefinition;
  createTools(): readonly RegisteredTool[];
}

export interface SkillContentCapabilityAdapter {
  kind: "skill";
  definition: CapabilityDefinition;
  discover(skills: readonly LoadedSkill[]): CapabilityDefinition[];
}

export interface McpCapabilityAdapter {
  kind: "mcp";
  definition: CapabilityDefinition;
  start(): Promise<readonly RegisteredTool[]>;
  close(): Promise<void>;
}

export interface WebCapabilityAdapter {
  kind: "web";
  definition: CapabilityDefinition;
  createTools(): readonly RegisteredTool[];
}

export interface CapabilityToolContribution {
  sources: ToolRegistrySource[];
  toolNames: string[];
}
