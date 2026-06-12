import readline from "node:readline/promises";
import process from "node:process";

import type { SessionStoreLike } from "../../session/index.js";
import type { SessionRecord } from "../../types.js";
import { writeStdout, writeStdoutLine } from "../../utils/stdio.js";
import { createHostSession } from "../../host/session.js";

const DEFAULT_SESSION_PICKER_LIMIT = 10;

export interface CliSessionSelection {
  session: SessionRecord;
  cwd: string;
}

export interface SessionPickerIo {
  writeLine(text?: string): void;
  readChoice(promptLabel: string): Promise<string | null>;
  now(): Date;
}

export async function selectCliSession(options: {
  cwd: string;
  cwdOverridden: boolean;
  sessionStore: SessionStoreLike;
  limit?: number;
  io?: Partial<SessionPickerIo>;
}): Promise<CliSessionSelection | null> {
  const sessions = await options.sessionStore.list(options.limit ?? DEFAULT_SESSION_PICKER_LIMIT);
  if (sessions.length === 0) {
    return {
      session: await createHostSession(options.sessionStore, options.cwd),
      cwd: options.cwd,
    };
  }

  const io = resolveSessionPickerIo(options.io);
  renderSessionPicker({
    sessions,
    io,
    now: io.now(),
  });

  while (true) {
    const answer = await io.readChoice("选择会话（输入编号，0 新建）: ");
    if (answer === null) {
      return null;
    }

    const selected = parseSessionPickerChoice(answer, sessions.length);
    if (selected.kind === "new") {
      return {
        session: await createHostSession(options.sessionStore, options.cwd),
        cwd: options.cwd,
      };
    }

    if (selected.kind === "existing") {
      const session = sessions[selected.index];
      if (!session) {
        io.writeLine("无效选择，请重新输入。");
        continue;
      }

      return {
        session,
        cwd: options.cwdOverridden ? options.cwd : session.cwd,
      };
    }

    io.writeLine("无效选择，请输入列表编号，或输入 0 新建会话。");
  }
}

export function renderSessionPicker(options: {
  sessions: SessionRecord[];
  io: Pick<SessionPickerIo, "writeLine">;
  now: Date;
}): void {
  options.io.writeLine("最近会话");
  options.io.writeLine("0. 新建会话");
  options.sessions.forEach((session, index) => {
    options.io.writeLine(
      `${index + 1}. ${formatSessionPickerTitle(session)}  ${formatRelativeSessionTime(session.updatedAt, options.now)}`,
    );
  });
  options.io.writeLine();
}

export function parseSessionPickerChoice(
  input: string,
  sessionCount: number,
): { kind: "new" } | { kind: "existing"; index: number } | { kind: "invalid" } {
  const trimmed = input.trim();
  if (trimmed === "") {
    return sessionCount > 0 ? { kind: "existing", index: 0 } : { kind: "new" };
  }

  const value = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(value) || String(value) !== trimmed) {
    return { kind: "invalid" };
  }

  if (value === 0) {
    return { kind: "new" };
  }

  if (value >= 1 && value <= sessionCount) {
    return { kind: "existing", index: value - 1 };
  }

  return { kind: "invalid" };
}

export function formatRelativeSessionTime(updatedAt: string, now: Date): string {
  const updatedTime = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedTime)) {
    return updatedAt;
  }

  const seconds = Math.max(0, Math.floor((now.getTime() - updatedTime) / 1000));
  if (seconds < 60) {
    return "刚刚";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} 天前`;
  }

  const weeks = Math.floor(days / 7);
  if (days < 30) {
    return `${weeks} 周前`;
  }

  const months = Math.floor(days / 30);
  if (days < 365) {
    return `${months} 个月前`;
  }

  return `${Math.floor(days / 365)} 年前`;
}

export function formatSessionPickerTitle(session: Pick<SessionRecord, "title" | "id">): string {
  const title = session.title?.trim();
  return truncateDisplayTitle(title || `未命名会话 ${session.id}`);
}

function truncateDisplayTitle(title: string): string {
  const chars = Array.from(title);
  const maxChars = 36;
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}...` : title;
}

function resolveSessionPickerIo(io: Partial<SessionPickerIo> | undefined): SessionPickerIo {
  return {
    writeLine: io?.writeLine ?? ((text = "") => writeStdoutLine(text)),
    readChoice: io?.readChoice ?? readCliSessionChoice,
    now: io?.now ?? (() => new Date()),
  };
}

async function readCliSessionChoice(promptLabel: string): Promise<string | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  try {
    const answer = await rl.question(promptLabel);
    return answer;
  } catch {
    writeStdout("\n");
    return null;
  } finally {
    rl.close();
  }
}
