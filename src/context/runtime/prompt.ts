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
    },
    taskLifecycle: input.taskLifecycle,
  });
  const sessionBriefBlock = buildSessionConversationBriefBlock(snapshot.sessionBrief);
  const taskLifecycleBlock = buildTaskLifecyclePromptBlock(snapshot.taskLifecycle);
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
      ? [sessionBriefBlock, ...(taskLifecycleBlock ? [taskLifecycleBlock] : []), ...(skillIndexBlock ? [skillIndexBlock] : []), ...(input.runtimeState?.internalFactBlocks ?? []), ...runtimeFactBlocks]
      : [...(taskLifecycleBlock ? [taskLifecycleBlock] : []), ...(skillIndexBlock ? [skillIndexBlock] : []), ...(input.runtimeState?.internalFactBlocks ?? []), ...runtimeFactBlocks],
  };
}

function buildTaskLifecyclePromptBlock(lifecycle: TaskLifecycleRecord | undefined): string | undefined {
  if (!lifecycle) {
    return undefined;
  }
  const fields: Array<PromptField | undefined> = [
    { label: "Stage", value: lifecycle.stage },
    lifecycle.objective ? { label: "Objective", value: lifecycle.objective } : undefined,
    lifecycle.scope ? { label: "Scope", value: lifecycle.scope } : undefined,
    lifecycle.boundary ? { label: "Boundary", value: lifecycle.boundary } : undefined,
    lifecycle.reason ? { label: "Reason", value: lifecycle.reason } : undefined,
    lifecycle.activeExecutionIds.length > 0
      ? { label: "Active executions", value: formatLimitedList(lifecycle.activeExecutionIds, 8) }
      : undefined,
    lifecycle.activeSpecId ? { label: "Active spec", value: lifecycle.activeSpecId } : undefined,
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
  return buildFieldBlock("Task lifecycle", fields.filter((field): field is PromptField => Boolean(field)));
}
