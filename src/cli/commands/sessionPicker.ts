import readline from "node:readline/promises";
import process from "node:process";

import type { SessionStoreLike } from "../../session/index.js";
import type { SessionRecord } from "../../types.js";
import { writeStdout, writeStdoutLine } from "../../utils/stdio.js";
import { createHostSession } from "../../host/session.js";
export {
  formatRelativeSessionTime,
  formatSessionPickerTitle,
  parseSessionPickerChoice,
} from "../../session/picker.js";
import {
  formatRelativeSessionTime,
  formatSessionPickerTitle,
  parseSessionPickerChoice,
} from "../../session/picker.js";

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
