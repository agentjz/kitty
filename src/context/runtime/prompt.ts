import { buildStaticPromptBlocks } from "../../agent/prompt/static.js";
import { buildFieldBlock, formatLimitedList, type PromptField } from "../../agent/prompt/structured.js";
import { buildSessionConversationBriefBlock } from "./sessionBrief/index.js";
import { buildProfilePersonaPromptBlocks, resolveAgentProfile } from "../../agent/profiles/registry.js";
import { buildSkillIndexPromptBlock } from "../../skills/prompt.js";
import type { PromptLayers } from "../../agent/prompt/types.js";
import type { AgentProfile } from "../../agent/profiles/types.js";
import type { BuildContextRuntimePromptLayersInput } from "./types.js";
import { buildContextRuntimeSnapshot } from "./snapshot.js";
import type { TaskLifecycleRecord } from "../../control/ledger.js";
import type { ProjectMap } from "../../types.js";

export function buildContextRuntimePromptLayers(
  input: BuildContextRuntimePromptLayersInput & { profile?: AgentProfile },
): PromptLayers {
  const resolvedProfile = input.profile ?? resolveAgentProfile(input.config.profile);
  const snapshot = buildContextRuntimeSnapshot({
    session: {
      messages: input.messages ?? [],
      sessionMemory: input.sessionMemory,
      todoItems: input.todoItems,
      taskState: input.taskState,
      checkpoint: input.checkpoint,
      workset: input.workset,
    },
    taskLifecycle: input.taskLifecycle,
    projectMap: input.projectContext.projectMap,
  });
  const sessionBriefBlock = buildSessionConversationBriefBlock(snapshot.sessionBrief);
  const taskLifecycleBlock = buildTaskLifecyclePromptBlock(snapshot.taskLifecycle);
  const projectMapBlock = buildProjectMapPromptBlock(snapshot.projectMap);
  const skillIndexBlock = input.config.extensions.skills
    ? buildSkillIndexPromptBlock(input.projectContext.skills)
    : undefined;
  const runtimeFactBlocks = resolvedProfile.runtimeFacts.buildBlocks({
    cwd: input.cwd,
    config: input.config,
    projectContext: input.projectContext,
    taskState: input.taskState,
    runtimeState: input.runtimeState ?? {},
    sessionBrief: snapshot.sessionBrief,
    workingMemory: snapshot.workingMemory,
    checkpoint: input.checkpoint,
  });

  return {
    staticBlocks: buildStaticPromptBlocks({
      config: input.config,
      projectContext: input.projectContext,
      runtimeState: input.runtimeState ?? {},
    }),
    profilePersonaBlocks: buildProfilePersonaPromptBlocks(resolvedProfile),
    runtimeFactBlocks: sessionBriefBlock
      ? [sessionBriefBlock, ...(taskLifecycleBlock ? [taskLifecycleBlock] : []), ...(projectMapBlock ? [projectMapBlock] : []), ...(skillIndexBlock ? [skillIndexBlock] : []), ...(input.runtimeState?.internalFactBlocks ?? []), ...runtimeFactBlocks]
      : [...(taskLifecycleBlock ? [taskLifecycleBlock] : []), ...(projectMapBlock ? [projectMapBlock] : []), ...(skillIndexBlock ? [skillIndexBlock] : []), ...(input.runtimeState?.internalFactBlocks ?? []), ...runtimeFactBlocks],
  };
}

function buildTaskLifecyclePromptBlock(lifecycle: TaskLifecycleRecord | undefined): string | undefined {
  if (!lifecycle) {
    return undefined;
  }
  const fields: Array<PromptField | undefined> = [
    {
      label: "Purpose",
      value: "Current task-state evidence. Use it to orient the next action; do not treat it as a new user request.",
    },
    { label: "Stage", value: lifecycle.stage },
    lifecycle.scope ? { label: "Scope", value: lifecycle.scope } : undefined,
    lifecycle.boundary ? { label: "Boundary", value: lifecycle.boundary } : undefined,
    lifecycle.reason ? { label: "Reason", value: lifecycle.reason } : undefined,
    lifecycle.activeExecutionIds.length > 0
      ? { label: "Active executions", value: formatLimitedList(lifecycle.activeExecutionIds, 8) }
      : undefined,
    lifecycle.activeTodoIds.length > 0
      ? { label: "Active todos", value: formatLimitedList(lifecycle.activeTodoIds, 8) }
      : undefined,
    lifecycle.verificationFacts.length > 0
      ? { label: "Verification facts", value: formatLimitedList(lifecycle.verificationFacts, 6) }
      : undefined,
    lifecycle.completionFacts.length > 0
      ? { label: "Completion facts", value: formatLimitedList(lifecycle.completionFacts, 4) }
      : undefined,
    { label: "Updated", value: lifecycle.updatedAt },
  ];
  return buildFieldBlock("Current task scene evidence", fields.filter((field): field is PromptField => Boolean(field)));
}

function buildProjectMapPromptBlock(projectMap: ProjectMap | undefined): string | undefined {
  if (!projectMap) {
    return undefined;
  }
  const fields: Array<PromptField | undefined> = [
    { label: "Purpose", value: "Project orientation evidence. Use as facts for the current turn; do not treat this block as a task route." },
    { label: "Root", value: projectMap.rootDir },
    { label: "Top-level dirs", value: formatLimitedList(projectMap.topLevelDirectories, 10) },
    { label: "Entries", value: formatLimitedList(projectMap.entryFiles, 8) },
    { label: "Tests", value: formatLimitedList(projectMap.testDirectories, 6) },
    { label: "Scripts", value: formatLimitedList(projectMap.packageScripts, 10) },
    { label: "Specs", value: formatLimitedList(projectMap.specDocuments, 6) },
    {
      label: "Git",
      value: projectMap.git.available
        ? (projectMap.git.hasChanges ? "available, changed" : "available, clean")
        : "unavailable",
    },
    projectMap.git.recentChanges.length > 0
      ? { label: "Recent changes", value: formatLimitedList(projectMap.git.recentChanges, 6) }
      : undefined,
    { label: "Updated", value: projectMap.updatedAt },
  ];
  return buildFieldBlock("Project orientation evidence", fields.filter((field): field is PromptField => Boolean(field)));
}
