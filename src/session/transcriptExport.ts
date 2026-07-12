import fs from "node:fs/promises";
import path from "node:path";

import type { SessionRecord, StoredMessage } from "../types.js";

export interface ConversationExportResult {
  filePath: string;
  sectionCount: number;
}

export async function exportSessionConversation(
  runtimeRootDir: string,
  session: SessionRecord,
): Promise<ConversationExportResult> {
  const sections = session.messages.flatMap(formatConversationMessage);
  const filePath = path.join(path.resolve(runtimeRootDir), `conversation-${safeFilePart(session.id)}.md`);
  if (sections.length === 0) return { filePath, sectionCount: 0 };

  const content = [
    "# Kitty Conversation",
    "",
    `Session: ${session.id}`,
    `Exported: ${new Date().toISOString()}`,
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n").trimEnd() + "\n";
  await fs.writeFile(filePath, content, "utf8");
  return { filePath, sectionCount: sections.length };
}

function formatConversationMessage(message: StoredMessage): string[] {
  if (message.role === "user" && message.source !== "internal" && message.content?.trim()) {
    return [formatSection("User", message.createdAt, message.content)];
  }
  if (message.role !== "assistant") return [];

  return [
    ...(message.reasoningContent?.trim()
      ? [formatSection("Assistant Reasoning", message.createdAt, message.reasoningContent)]
      : []),
    ...(message.content?.trim()
      ? [formatSection("Assistant", message.createdAt, message.content)]
      : []),
  ];
}

function formatSection(label: string, createdAt: string, content: string): string {
  return `## ${label} · ${createdAt}\n\n${content}`;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-") || "session";
}
