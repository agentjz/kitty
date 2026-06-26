import { buildFieldBlock, formatLimitedList } from "../../../agent/prompt/structured.js";
import { isInternalMessage, readUserInput } from "../../../session/turnFrame.js";
import type { SessionMemoryState, StoredMessage } from "../../../types.js";
import type { SessionConversationBrief } from "./types.js";

const MAX_SIGNALS_PER_KIND = 4;

export interface BuildSessionConversationBriefInput {
  messages: StoredMessage[];
  sessionMemory?: SessionMemoryState;
  timestamp?: string;
}

export function buildSessionConversationBrief(
  input: BuildSessionConversationBriefInput,
): SessionConversationBrief | undefined {
  const modelSummary = input.sessionMemory?.summary;
  if (!modelSummary) {
    return undefined;
  }

  const visibleTurns = input.messages
    .map(toVisibleTurnFact)
    .filter((turn): turn is VisibleTurnFact => Boolean(turn));

  return {
    version: 1,
    modelSummary,
    modelSummaryUpdatedAt: input.sessionMemory?.updatedAt,
    userTurnCount: visibleTurns.filter((turn) => turn.role === "user").length,
    assistantTurnCount: visibleTurns.filter((turn) => turn.role === "assistant").length,
    toolActivity: collectToolActivity(visibleTurns),
    updatedAt: input.timestamp ?? new Date().toISOString(),
  };
}

export function buildSessionConversationBriefBlock(
  brief: SessionConversationBrief | undefined,
): string | undefined {
  if (!brief?.modelSummary) {
    return undefined;
  }

  return buildFieldBlock("Conversation continuity evidence", [
    {
      label: "Purpose",
      value: "Use these facts as private continuity state. Answer the current request directly. Quote prior turns only when the user asks.",
    },
    brief.modelSummary
      ? {
          label: "Model-written session memory",
          value: brief.modelSummary,
        }
      : { label: "Model-written session memory", value: undefined },
    brief.modelSummaryUpdatedAt
      ? {
          label: "Updated",
          value: brief.modelSummaryUpdatedAt,
        }
      : { label: "Updated", value: undefined },
    {
      label: "Near-field visible turns",
      value: `${brief.userTurnCount} user turn(s) with current input / ${brief.assistantTurnCount} assistant response(s)`,
    },
    {
      label: "Recent tool activity",
      value: formatSignals(brief.toolActivity),
    },
  ]);
}

interface VisibleTurnFact {
  role: "user" | "assistant";
  toolNames?: string[];
}

function toVisibleTurnFact(message: StoredMessage): VisibleTurnFact | undefined {
  if (message.role === "user") {
    const text = readUserInput(message);
    return text ? { role: "user" } : undefined;
  }

  if (message.role !== "assistant") {
    return undefined;
  }

  if (message.tool_calls?.length) {
    const toolNames = message.tool_calls.map((toolCall) => toolCall.function.name);
    return {
      role: "assistant",
      toolNames,
    };
  }

  const content = normalizeOneLine(message.content ?? "");
  if (!content || isInternalMessage(message)) {
    return undefined;
  }

  return { role: "assistant" };
}

function collectToolActivity(turns: VisibleTurnFact[]): string[] {
  const values = turns
    .flatMap((turn) => turn.toolNames?.length ? [`tools: ${turn.toolNames.join(", ")}`] : []);
  return takeLastUnique(values, MAX_SIGNALS_PER_KIND);
}

function formatSignals(values: string[]): string | undefined {
  return values.length > 0 ? formatLimitedList(values, MAX_SIGNALS_PER_KIND) : undefined;
}

function normalizeOneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function takeLastUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of [...values].reverse()) {
    const normalized = normalizeOneLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.unshift(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}
