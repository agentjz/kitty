import type { CapabilityCost } from "../protocol/capability.js";
import type { RegisteredTool } from "../tools/core/types.js";
import { createBackgroundTools } from "./tools/background/index.js";
import { createNetworkTools } from "./tools/network/index.js";
import { createSpecTools } from "./tools/spec/index.js";
import { createSubagentTools } from "./tools/subagent/index.js";
import { createTeamTools } from "./tools/team/index.js";
import { createTodoTools } from "./tools/todo/index.js";
import { createWorktreeTools } from "./tools/worktree/index.js";

export interface ExtensionDefinition {
  id: string;
  envKey: `KITTY_EXTENSION_${string}`;
  defaultEnabled: boolean;
  summary: string;
  createTools: () => readonly RegisteredTool[];
  capability: {
    description: string;
    bestFor: readonly string[];
    cost: CapabilityCost;
  };
}

export const EXTENSION_DEFINITIONS = [
  {
    id: "todo",
    envKey: "KITTY_EXTENSION_TODO",
    defaultEnabled: true,
    summary: "Session todo writing and visible checklist preview.",
    createTools: createTodoTools,
    capability: {
      description: "Session-level todo checklist writing and visible progress preview.",
      bestFor: [
        "maintaining current session checklist state",
        "showing concise progress preview",
      ],
      cost: "low",
    },
  },
  {
    id: "worktree",
    envKey: "KITTY_EXTENSION_WORKTREE",
    defaultEnabled: true,
    summary: "Git worktree discovery and lifecycle management.",
    createTools: createWorktreeTools,
    capability: {
      description: "Git worktree discovery and lifecycle management.",
      bestFor: [
        "inspecting git worktrees",
        "creating and removing explicit worktree paths",
      ],
      cost: "medium",
    },
  },
  {
    id: "network",
    envKey: "KITTY_EXTENSION_NETWORK",
    defaultEnabled: true,
    summary: "HTTP session, request, probe, download, trace, and OpenAPI tools.",
    createTools: createNetworkTools,
    capability: {
      description: "HTTP session, request, probe, suite, download, trace, and OpenAPI inspection tools.",
      bestFor: [
        "probing HTTP services",
        "running structured HTTP request suites",
        "recording network evidence",
      ],
      cost: "medium",
    },
  },
  {
    id: "background",
    envKey: "KITTY_EXTENSION_BACKGROUND",
    defaultEnabled: true,
    summary: "Background command execution with durable lifecycle tracking.",
    createTools: createBackgroundTools,
    capability: {
      description: "Background command execution with control-plane lifecycle tracking and wake facts.",
      bestFor: [
        "running long local commands without blocking the current turn",
        "checking or terminating recorded background executions",
      ],
      cost: "medium",
    },
  },
  {
    id: "subagent",
    envKey: "KITTY_EXTENSION_SUBAGENT",
    defaultEnabled: true,
    summary: "Focused subagent execution with durable lifecycle tracking.",
    createTools: createSubagentTools,
    capability: {
      description: "Focused subagent execution recorded in the control plane.",
      bestFor: [
        "delegating bounded investigation or implementation work",
        "checking subagent execution state",
      ],
      cost: "medium",
    },
  },
  {
    id: "team",
    envKey: "KITTY_EXTENSION_TEAM",
    defaultEnabled: true,
    summary: "Teammate execution, registry, inbox, and message tools.",
    createTools: createTeamTools,
    capability: {
      description: "Teammate execution registry and explicit message passing.",
      bestFor: [
        "spawning named teammate executions",
        "sending and reading teammate inbox messages",
      ],
      cost: "medium",
    },
  },
  {
    id: "spec",
    envKey: "KITTY_EXTENSION_SPEC",
    defaultEnabled: false,
    summary: "Durable spec documents, workflow state, checkpoints, and isolated worktree support.",
    createTools: createSpecTools,
    capability: {
      description: "Durable spec documents, workflow state, checkpoints, and isolated worktree support.",
      bestFor: [
        "requirements/design/tasks workflow",
        "durable spec review",
        "checkpointed spec implementation",
      ],
      cost: "medium",
    },
  },
] as const satisfies readonly ExtensionDefinition[];

export type ExtensionId = (typeof EXTENSION_DEFINITIONS)[number]["id"];

export const EXTENSION_IDS = EXTENSION_DEFINITIONS.map((definition) => definition.id) as ExtensionId[];

export const EXTENSION_ENV_KEYS = Object.fromEntries(
  EXTENSION_DEFINITIONS.map((definition) => [definition.id, definition.envKey]),
) as Record<ExtensionId, (typeof EXTENSION_DEFINITIONS)[number]["envKey"]>;

export function getExtensionDefinition(id: ExtensionId): (typeof EXTENSION_DEFINITIONS)[number] {
  return EXTENSION_DEFINITIONS.find((definition) => definition.id === id) ?? missingExtensionDefinition(id);
}

function missingExtensionDefinition(id: ExtensionId): never {
  throw new Error(`Unknown extension definition: ${String(id)}`);
}
