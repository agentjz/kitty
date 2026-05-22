import fs from "node:fs/promises";
import path from "node:path";

import type { SessionRecord } from "../types.js";

export function getSessionMemoryAssetPath(memorySessionsDir: string, sessionId: string): string {
  return path.join(memorySessionsDir, `${sanitizeSessionId(sessionId)}.md`);
}

export async function writeSessionMemoryAsset(input: {
  memorySessionsDir: string;
  session: SessionRecord;
}): Promise<string | undefined> {
  const memory = input.session.sessionMemory;
  if (!memory?.summary.trim()) {
    await fs.rm(getSessionMemoryAssetPath(input.memorySessionsDir, input.session.id), { force: true }).catch(() => undefined);
    return undefined;
  }

  await fs.mkdir(input.memorySessionsDir, { recursive: true });
  const file = getSessionMemoryAssetPath(input.memorySessionsDir, input.session.id);
  await fs.writeFile(file, renderSessionMemoryAsset(input.session), "utf8");
  return file;
}

function renderSessionMemoryAsset(session: SessionRecord): string {
  const memory = session.sessionMemory;
  if (!memory) {
    return "";
  }

  return [
    "# Session Memory",
    "",
    `Session: ${session.id}`,
    `Updated: ${memory.updatedAt}`,
    "",
    memory.summary.trim(),
    "",
  ].join("\n");
}

function sanitizeSessionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
