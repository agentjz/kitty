import { createBackgroundTools } from "./tools/background/index.js";
import { createDocumentTools } from "./tools/documents/index.js";
import { createMediaTools } from "./tools/media/index.js";
import { createSchedulerTools } from "./tools/scheduler/index.js";
import { createSkillTools } from "./tools/skills/index.js";
import { createTodoTools } from "./tools/todo/index.js";
import { createWorktreeTools } from "./tools/worktree/index.js";
import type { BuiltinToolCapabilityAdapter, CapabilityDefinition } from "./types.js";

export const CORE_CAPABILITY: CapabilityDefinition = {
  id: "core-tools",
  kind: "core",
  version: "1",
  label: "Core tools",
  summary: "Local file, command, change, and file-delivery tools.",
  installed: true,
  installationSource: "bundled",
  defaultEnabled: true,
  canDisable: true,
  requiredConfigKeys: [],
};

export const BUILTIN_CAPABILITY_ADAPTERS = [
  builtin("todo", "Todo", "Session checklist state and progress preview.", createTodoTools),
  builtin("scheduler", "Scheduler", "Durable reminders and prewritten command schedules.", createSchedulerTools),
  builtin("worktree", "Worktrees", "Git worktree discovery and lifecycle management.", createWorktreeTools),
  builtin("background", "Background tasks", "Durable background command execution and observation.", createBackgroundTools),
  builtin("documents", "Documents", "Bounded document reading and Word document writing.", createDocumentTools),
  builtin("media", "Media", "Configured image generation and durable video workflows.", createMediaTools, ["KITTY_MEDIA_API_KEY"]),
  builtin("skills", "Skill packages", "Discover and load project skill content only when requested.", createSkillTools),
] as const satisfies readonly BuiltinToolCapabilityAdapter[];

export const PLAYWRIGHT_CAPABILITY: CapabilityDefinition = {
  id: "playwright",
  kind: "mcp",
  version: "1",
  label: "Playwright MCP",
  summary: "Persistent browser automation through the approved Playwright MCP server.",
  installed: true,
  installationSource: "npm",
  defaultEnabled: false,
  canDisable: true,
  requiredConfigKeys: [],
};

export const WEB_CAPABILITY: CapabilityDefinition = {
  id: "web",
  kind: "web",
  version: "1",
  label: "Web access",
  summary: "Credential-free web search, bounded page reading, and atomic file downloads.",
  installed: true,
  installationSource: "bundled",
  defaultEnabled: true,
  canDisable: true,
  requiredConfigKeys: [],
};

export const STATIC_CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
  CORE_CAPABILITY,
  ...BUILTIN_CAPABILITY_ADAPTERS.map((adapter) => adapter.definition),
  PLAYWRIGHT_CAPABILITY,
  WEB_CAPABILITY,
];

export function createSkillCapabilityDefinition(input: {
  name: string;
  description: string;
}): CapabilityDefinition {
  return {
    id: `skill:${input.name}`,
    kind: "skill",
    version: "1",
    label: input.name,
    summary: input.description,
    installed: true,
    installationSource: "project",
    defaultEnabled: true,
    canDisable: true,
    requiredConfigKeys: [],
  };
}

export function getStaticCapabilityDefinition(id: string): CapabilityDefinition | undefined {
  return STATIC_CAPABILITY_DEFINITIONS.find((definition) => definition.id === id);
}

function builtin(
  id: string,
  label: string,
  summary: string,
  createTools: BuiltinToolCapabilityAdapter["createTools"],
  requiredConfigKeys: readonly string[] = [],
): BuiltinToolCapabilityAdapter {
  return {
    kind: "builtin",
    definition: {
      id,
      kind: "builtin",
      version: "1",
      label,
      summary,
      installed: true,
      installationSource: "bundled",
      defaultEnabled: true,
      canDisable: true,
      requiredConfigKeys,
    },
    createTools,
  };
}
