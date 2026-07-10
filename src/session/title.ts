import type { ProviderMessage } from "../provider/contract.js";
import type { AssistantResponse } from "../agent/types.js";
import type { SessionRecord, StoredMessage } from "../types.js";
import { readUserInput } from "./turnFrame.js";

const MAX_TITLE_FACT_CHARS = 4_000;
const MAX_SESSION_TITLE_CHARS = 36;

export function shouldGenerateSessionTitle(input: {
  session: SessionRecord;
  userInput: Pick<StoredMessage, "content" | "source">;
  assistantResponse: Pick<AssistantResponse, "content">;
}): boolean {
  if (input.session.title?.trim()) {
    return false;
  }

  if (!readUserInput(input.userInput)) {
    return false;
  }

  if (!input.assistantResponse.content?.trim()) {
    return false;
  }

  return true;
}

export function buildSessionTitleMessages(input: {
  userInput: Pick<StoredMessage, "content" | "source">;
  assistantResponse: Pick<AssistantResponse, "content">;
}): ProviderMessage[] {
  return [
    {
      role: "system",
      content: [
        "Create a concise title for this conversation.",
        "Use Simplified Chinese.",
        "Write only the title.",
        "Keep it specific and useful for a recent-session list.",
        "Maximum 18 Chinese characters or 8 English words.",
      ].join("\n"),
    },
    {
      role: "user",
      content: truncate([
        `User first message:\n${readUserInput(input.userInput) ?? ""}`,
        `Assistant first response:\n${input.assistantResponse.content?.trim() ?? ""}`,
      ].join("\n\n"), MAX_TITLE_FACT_CHARS),
    },
  ];
}

export function applyModelSessionTitle(session: SessionRecord, rawTitle: string): SessionRecord {
  const title = normalizeModelSessionTitle(rawTitle);
  if (!title) {
    return session;
  }

  return {
    ...session,
    title,
  };
}

export function normalizeModelSessionTitle(rawTitle: string): string | undefined {
  const normalized = rawTitle
    .replace(/\s+/g, " ")
    .replace(/^#+\s*/, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[。！？!?；;，,：:、]+$/g, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (!normalized || containsToolProtocolText(normalized)) {
    return undefined;
  }

  const chars = Array.from(normalized);
  return chars.length > MAX_SESSION_TITLE_CHARS
    ? `${chars.slice(0, MAX_SESSION_TITLE_CHARS).join("")}...`
    : normalized;
}

function containsToolProtocolText(value: string): boolean {
  return value.includes("<｜") ||
    value.includes("<tool_call>") ||
    value.includes("\"tool_calls\"") ||
    value.includes("tool_calls");
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}
