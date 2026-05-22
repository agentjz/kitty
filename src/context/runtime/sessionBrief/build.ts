import { buildFieldBlock, formatLimitedList } from "../../../agent/prompt/structured.js";
import { isInternalMessage, readUserInput } from "../../../session/turnFrame.js";
import type { SessionMemoryState, StoredMessage } from "../../../types.js";
import type { SessionBriefTurn, SessionConversationBrief } from "./types.js";

const MAX_RECENT_USER_INPUTS = 4;
const MAX_USER_ANCHORS = 4;
const MAX_TURN_CHARS = 700;
const MAX_ANCHOR_CHARS = 360;
const MAX_THREAD_CHARS = 900;
const MAX_SIGNALS_PER_KIND = 4;

export interface BuildSessionConversationBriefInput {
  messages: StoredMessage[];
  sessionMemory?: SessionMemoryState;
  timestamp?: string;
}

export function buildSessionConversationBrief(
  input: BuildSessionConversationBriefInput,
): SessionConversationBrief | undefined {
  const includedTurns = input.messages
    .map(toVisibleTurn)
    .filter((turn): turn is SessionBriefTurn => Boolean(turn));

  const modelSummary = input.sessionMemory?.summary;
  if (includedTurns.length === 0 && !modelSummary) {
    return undefined;
  }

  const userTurns = includedTurns.filter((turn) => turn.role === "user");
  const recentUserInputs = userTurns.slice(-MAX_RECENT_USER_INPUTS).map((turn) => turn.text);
  const userAnchors = collectUserAnchors(userTurns, recentUserInputs);
  const userTurnCount = includedTurns.filter((turn) => turn.role === "user").length;
  const assistantTurnCount = includedTurns.filter((turn) => turn.role === "assistant").length;

  return {
    version: 1,
    modelSummary,
    modelSummaryUpdatedAt: input.sessionMemory?.updatedAt,
    userTurnCount,
    assistantTurnCount,
    omittedLongTurnCount: 0,
    userAnchors,
    recentUserInputs,
    toolActivity: collectToolActivity(includedTurns),
    currentThread: inferCurrentThread(recentUserInputs),
    updatedAt: input.timestamp ?? new Date().toISOString(),
  };
}

export function buildSessionConversationBriefBlock(
  brief: SessionConversationBrief | undefined,
): string | undefined {
  if (!brief || (brief.recentUserInputs.length <= 1 && !brief.modelSummary)) {
    return undefined;
  }

  return buildFieldBlock("Internal continuity state", [
    {
      label: "Purpose",
      value: "Use these facts as private continuity state. Answer the current request directly. Quote prior turns only when the user asks.",
    },
    brief.modelSummary
      ? {
          label: "Session memory",
          value: brief.modelSummary,
        }
      : { label: "Session memory", value: undefined },
    brief.modelSummaryUpdatedAt
      ? {
          label: "Memory updated at",
          value: brief.modelSummaryUpdatedAt,
        }
      : { label: "Memory updated at", value: undefined },
    {
      label: "Briefed turns",
      value: `${brief.userTurnCount} user turn(s) with current input / ${brief.assistantTurnCount} assistant response(s)`,
    },
    brief.omittedLongTurnCount > 0
      ? {
          label: "Omitted long turns",
          value: `${brief.omittedLongTurnCount} earlier visible turn(s) were too large for automatic injection; query history only if their exact content matters.`,
        }
      : { label: "Omitted long turns", value: undefined },
    {
      label: "Current user thread",
      value: brief.currentThread,
    },
    {
      label: "User anchors",
      value: brief.userAnchors.length > 0
        ? formatLimitedList(brief.userAnchors, MAX_USER_ANCHORS)
        : undefined,
    },
    {
      label: "Tool activity",
      value: formatSignals(brief.toolActivity),
    },
    {
      label: "Recent user inputs",
      value: formatLimitedList(brief.recentUserInputs, MAX_RECENT_USER_INPUTS),
    },
  ]);
}

type VisibleTurnCandidate = SessionBriefTurn | undefined;

function toVisibleTurn(message: StoredMessage): VisibleTurnCandidate {
  if (message.role === "user") {
    const text = readUserInput(message.content);
    return visibleTextCandidate(text, "user");
  }

  if (message.role !== "assistant") {
    return undefined;
  }

  if (message.tool_calls?.length) {
    const toolNames = message.tool_calls.map((toolCall) => toolCall.function.name);
    const content = normalizeOneLine(message.content ?? "");
    return {
      role: "assistant",
      text: excerpt(content ? `${content} | tools: ${toolNames.join(", ")}` : `tools: ${toolNames.join(", ")}`, MAX_TURN_CHARS),
      toolNames,
    };
  }

  const content = normalizeOneLine(message.content ?? "");
  if (!content || isInternalMessage(content)) {
    return undefined;
  }

  return visibleTextCandidate(content, "assistant");
}

function inferCurrentThread(userInputs: string[]): string | undefined {
  if (userInputs.length === 0) {
    return undefined;
  }

  return truncate(userInputs.slice(-3).join(" -> "), MAX_THREAD_CHARS);
}

function collectToolActivity(turns: SessionBriefTurn[]): string[] {
  const values = turns
    .flatMap((turn) => turn.toolNames?.length ? [`tools: ${turn.toolNames.join(", ")}`] : []);
  return takeLastUnique(values, MAX_SIGNALS_PER_KIND);
}

function collectUserAnchors(
  userTurns: SessionBriefTurn[],
  recentUserInputs: string[],
): string[] {
  const recent = new Set(recentUserInputs);
  const olderTurns = userTurns.filter((turn) => !recent.has(turn.text));
  const candidates = [
    ...olderTurns.slice(0, 2),
    ...olderTurns.slice(-2),
  ];
  return takeLastUniqueTurns(candidates, MAX_USER_ANCHORS)
    .map((turn) => excerpt(turn.text, MAX_ANCHOR_CHARS));
}

function formatSignals(values: string[]): string | undefined {
  return values.length > 0 ? formatLimitedList(values, MAX_SIGNALS_PER_KIND) : undefined;
}

function normalizeOneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function visibleTextCandidate(
  value: string | undefined,
  role: SessionBriefTurn["role"],
): VisibleTurnCandidate {
  if (!value) {
    return undefined;
  }
  return { role, text: excerpt(value, MAX_TURN_CHARS) };
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

function truncate(value: string, maxChars: number): string {
  const normalized = normalizeOneLine(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function takeLastUniqueTurns(turns: SessionBriefTurn[], limit: number): SessionBriefTurn[] {
  const seen = new Set<string>();
  const output: SessionBriefTurn[] = [];
  for (const turn of [...turns].reverse()) {
    const key = `${turn.role}:${normalizeOneLine(turn.text).toLowerCase()}`;
    if (!turn.text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.unshift(turn);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function excerpt(value: string, maxChars: number): string {
  const normalized = normalizeOneLine(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const headChars = Math.max(1, Math.floor(maxChars * 0.62));
  const tailChars = Math.max(1, maxChars - headChars - 5);
  return `${normalized.slice(0, headChars)} ... ${normalized.slice(-tailChars)}`;
}
