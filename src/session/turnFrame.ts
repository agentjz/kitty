import type { StoredMessage } from "../types.js";

export function isInternalMessage(message: Pick<StoredMessage, "source"> | string | null | undefined): boolean {
  if (typeof message === "object" && message !== null && "source" in message) {
    return message.source === "internal";
  }

  return false;
}

export function createInternalReminder(text: string): string {
  return text.trim();
}

export function readUserInput(message: Pick<StoredMessage, "content" | "source"> | string | null | undefined): string | undefined {
  if (typeof message === "object" && message !== null) {
    if (isInternalMessage(message)) {
      return undefined;
    }

    const normalized = oneLine(message.content ?? "");
    return normalized || undefined;
  }

  if (isInternalMessage(message)) {
    return undefined;
  }

  const normalized = oneLine(message ?? "");
  return normalized || undefined;
}

export function findLatestUserInputIndex(messages: StoredMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && readUserInput(message)) {
      return index;
    }
  }

  return -1;
}

export function sliceCurrentUserInputFrame(messages: StoredMessage[]): StoredMessage[] {
  const frameStart = findLatestUserInputIndex(messages);
  if (frameStart < 0) {
    return [];
  }

  const frame = messages.slice(frameStart);
  return frame.filter((message) => !(message.role === "user" && isInternalMessage(message)));
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
