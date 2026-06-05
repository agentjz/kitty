import type { ProviderMessage } from "../provider/contract.js";
import type { AssistantResponse } from "../agent/types.js";
import type { SessionDiffChange, SessionRecord, StoredMessage, ToolCallRecord } from "../types.js";
import { formatSessionMemorySectionList, formatSessionMemorySectionTemplate } from "./memory.js";
import { sliceCurrentUserInputFrame } from "./turnFrame.js";

const MAX_MEMORY_INPUT_CHARS = 24_000;
const MAX_TOOL_RESULT_CHARS = 1_200;
const MAX_FACT_LINE_CHARS = 900;

export interface BuildSessionMemoryCompactionRequestInput {
  session: SessionRecord;
  userInput: string;
  assistantResponse: Pick<AssistantResponse, "content" | "toolCalls">;
}

export function buildSessionMemoryCompactionMessages(
  input: BuildSessionMemoryCompactionRequestInput,
): ProviderMessage[] {
  const previousMemory = input.session.sessionMemory?.summary ?? "";
  const visibleAssistantText = input.assistantResponse.content ?? "";
  const currentFrame = sliceCurrentUserInputFrame(input.session.messages);
  const toolActivity = formatToolActivity([
    ...input.assistantResponse.toolCalls,
    ...collectCurrentTurnToolCalls(currentFrame),
  ]);
  const toolEvidence = formatToolEvidence(currentFrame);
  const checkpointEvidence = formatCheckpointEvidence(input.session);
  const sessionDiffEvidence = formatSessionDiffEvidence(input.session);

  return [
    {
      role: "system",
      content: [
        "Update same-session memory from the supplied facts.",
        "Write only the memory text using the exact Markdown sections below.",
        "Keep stable user constraints only when they affect future action.",
        "Keep active work focus, important decisions, and unresolved next steps.",
        "Write compact operational memory, not a transcript or review narrative.",
        "Base every statement on supplied facts.",
        "Use supplied facts only. Drop stale focus unless it still affects the next turn.",
        "",
        "Required sections:",
        formatSessionMemorySectionList(),
      ].join("\n"),
    },
    {
      role: "user",
      content: truncate([
        previousMemory ? `Previous session memory:\n${previousMemory}` : "Previous session memory: none",
        `Current user input:\n${input.userInput}`,
        visibleAssistantText ? `Assistant visible response:\n${visibleAssistantText}` : "Assistant visible response: none",
        toolActivity ? `Tool activity:\n${toolActivity}` : "Tool activity: none",
        toolEvidence ? `Tool evidence:\n${toolEvidence}` : "Tool evidence: none",
        checkpointEvidence ? `Checkpoint facts:\n${checkpointEvidence}` : "Checkpoint facts: none",
        sessionDiffEvidence ? `Session diff facts:\n${sessionDiffEvidence}` : "Session diff facts: none",
        `Memory output template:\n${formatSessionMemorySectionTemplate()}`,
      ].join("\n\n"), MAX_MEMORY_INPUT_CHARS),
    },
  ];
}

function formatToolActivity(toolCalls: ToolCallRecord[]): string | undefined {
  const names = [...new Set(toolCalls.map((toolCall) => toolCall.function.name).filter(Boolean))];
  if (names.length === 0) {
    return undefined;
  }
  return names.join(", ");
}

function collectCurrentTurnToolCalls(messages: StoredMessage[]): ToolCallRecord[] {
  return messages.flatMap((message) => message.tool_calls ?? []);
}

function formatToolEvidence(messages: StoredMessage[]): string | undefined {
  const toolMessages = messages.filter((message) => message.role === "tool");
  if (toolMessages.length === 0) {
    return undefined;
  }

  return toolMessages
    .map((message) => {
      const name = message.name ?? "unknown";
      const content = truncateOneLine(message.content ?? "", MAX_TOOL_RESULT_CHARS);
      return `- ${name}: ${content || "(empty result)"}`;
    })
    .join("\n");
}

function formatCheckpointEvidence(session: SessionRecord): string | undefined {
  const checkpoint = session.checkpoint;
  if (!checkpoint) {
    return undefined;
  }

  const facts = [
    checkpoint.focus ? `focus=${checkpoint.focus}` : undefined,
    `status=${checkpoint.status}`,
    `phase=${checkpoint.flow.phase}`,
    checkpoint.flow.reason ? `reason=${checkpoint.flow.reason}` : undefined,
    checkpoint.recentToolBatch
      ? `recentToolBatch=${checkpoint.recentToolBatch.summary}; changed=${checkpoint.recentToolBatch.changedPaths.join(", ")}`
      : undefined,
    checkpoint.completedSteps.length > 0
      ? `completedSteps=${checkpoint.completedSteps.join(" | ")}`
      : undefined,
  ].filter((fact): fact is string => Boolean(fact));

  return facts.length > 0 ? facts.map((fact) => `- ${truncateOneLine(fact, MAX_FACT_LINE_CHARS)}`).join("\n") : undefined;
}

function formatSessionDiffEvidence(session: SessionRecord): string | undefined {
  const diff = session.sessionDiff;
  if (!diff || (diff.changedPaths.length === 0 && diff.changes.length === 0)) {
    return undefined;
  }

  const pathLine = diff.changedPaths.length > 0
    ? [`- changedPaths=${diff.changedPaths.join(", ")}`]
    : [];
  const changeLines = diff.changes.slice(-5).map(formatSessionDiffChange);
  return [...pathLine, ...changeLines].join("\n");
}

function formatSessionDiffChange(change: SessionDiffChange): string {
  return `- ${change.toolName}: changed=${change.changedPaths.join(", ")}; diagnostics=${change.diagnosticsStatus}; errors=${change.errorCount}; warnings=${change.warningCount}`;
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

function truncateOneLine(value: string, maxChars: number): string {
  return truncate(value.replace(/\s+/g, " ").trim(), maxChars);
}
