import { expandStartToToolBoundary } from "../../session/messages.js";
import { isInternalMessage, readUserInput } from "../../session/turnFrame.js";
import type { StoredMessage } from "../../types.js";

export interface VisibleConversationWindow {
  messages: StoredMessage[];
  totalVisibleMessages: number;
  droppedInternalMessages: number;
}

export function buildVisibleConversationWindow(
  messages: StoredMessage[],
  options: { tailCount?: number } = {},
): VisibleConversationWindow {
  const visible = collectVisibleConversationMessages(messages);
  const tailCount = options.tailCount ?? visible.length;
  const startIndex = Math.max(0, visible.length - Math.max(0, tailCount));
  const safeStartIndex = expandStartToToolBoundary(visible, startIndex);

  return {
    messages: visible.slice(safeStartIndex),
    totalVisibleMessages: visible.length,
    droppedInternalMessages: messages.length - visible.length,
  };
}

export function collectVisibleConversationMessages(messages: StoredMessage[]): StoredMessage[] {
  const output: StoredMessage[] = [];
  let includeCurrentTurn = false;

  for (const message of messages) {
    if (message.role === "user") {
      includeCurrentTurn = Boolean(readUserInput(message.content));
      if (includeCurrentTurn) {
        output.push(message);
      }
      continue;
    }

    if (message.role === "system") {
      continue;
    }

    if (!includeCurrentTurn) {
      continue;
    }

    if (message.role === "assistant" && isInternalMessage(message.content)) {
      continue;
    }

    output.push(message);
  }

  return output;
}
