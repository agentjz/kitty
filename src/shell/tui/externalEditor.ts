import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execaCommand } from "execa";

export interface ExternalEditorOptions {
  command?: string;
  run?: (command: string, filePath: string) => Promise<void>;
}

export async function editTextExternally(
  value: string,
  options: ExternalEditorOptions = {},
): Promise<string> {
  const command = options.command ?? process.env.VISUAL ?? process.env.EDITOR ?? defaultEditorCommand();
  const directory = await mkdtemp(path.join(os.tmpdir(), "kitty-editor-"));
  const filePath = path.join(directory, "prompt.md");
  try {
    await writeFile(filePath, value, "utf8");
    await (options.run ?? runExternalEditor)(command, filePath);
    return normalizeEditorText(await readFile(filePath, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runExternalEditor(command: string, filePath: string): Promise<void> {
  await execaCommand(`${command} ${quoteShellArgument(filePath)}`, { stdio: "inherit" });
}

function defaultEditorCommand(): string {
  return process.platform === "win32" ? "notepad" : "vi";
}

function normalizeEditorText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function quoteShellArgument(value: string): string {
  if (process.platform === "win32") {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
