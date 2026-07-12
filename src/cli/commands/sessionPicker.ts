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
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../../i18n/index.js";

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
  locale?: KittyLocale;
}): Promise<CliSessionSelection | null> {
  const sessions = await options.sessionStore.list(options.limit ?? DEFAULT_SESSION_PICKER_LIMIT);
  if (sessions.length === 0) {
    return {
      session: await createHostSession(options.sessionStore, options.cwd),
      cwd: options.cwd,
    };
  }

  const io = resolveSessionPickerIo(options.io);
  const locale = options.locale ?? DEFAULT_LOCALE;
  renderSessionPicker({
    sessions,
    io,
    now: io.now(),
    locale,
  });

  while (true) {
    const answer = await io.readChoice(translate(locale, "cli.sessionPicker.prompt"));
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
        io.writeLine(translate(locale, "cli.sessionPicker.invalid"));
        continue;
      }

      return {
        session,
        cwd: options.cwdOverridden ? options.cwd : session.cwd,
      };
    }

    io.writeLine(translate(locale, "cli.sessionPicker.invalidRange"));
  }
}

export function renderSessionPicker(options: {
  sessions: SessionRecord[];
  io: Pick<SessionPickerIo, "writeLine">;
  now: Date;
  locale?: KittyLocale;
}): void {
  const locale = options.locale ?? DEFAULT_LOCALE;
  options.io.writeLine(translate(locale, "cli.sessionPicker.recent"));
  options.io.writeLine(`0. ${translate(locale, "cli.sessionPicker.new")}`);
  options.sessions.forEach((session, index) => {
    options.io.writeLine(
      `${index + 1}. ${formatSessionPickerTitle(session, locale)}  ${formatRelativeSessionTime(session.updatedAt, options.now, locale)}`,
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
