import { spawn } from "node:child_process";

const CLIPBOARD_TIMEOUT_MS = 5_000;
const WINDOWS_CLIPBOARD_SCRIPT =
  "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; $ErrorActionPreference = 'Stop'; Set-Clipboard -Value ([Console]::In.ReadToEnd())";

export interface TuiClipboardOptions {
  output?: Pick<NodeJS.WriteStream, "isTTY" | "write">;
  platform?: NodeJS.Platform;
  runCommand?: (command: string, args: readonly string[], text: string) => Promise<void>;
}

export async function writeTuiClipboard(text: string, options: TuiClipboardOptions = {}): Promise<void> {
  if (!text) throw new Error("No transcript text is selected.");
  const platform = options.platform ?? process.platform;
  const runCommand = options.runCommand ?? runClipboardCommand;
  let nativeError: unknown;
  for (const candidate of nativeClipboardCommands(platform)) {
    try {
      await runCommand(candidate.command, candidate.args, text);
      return;
    } catch (error) {
      nativeError = error;
    }
  }

  const output = options.output ?? process.stdout;
  if (output.isTTY) {
    try {
      output.write(`\u001b]52;c;${Buffer.from(text, "utf8").toString("base64")}\u0007`);
      return;
    } catch (error) {
      throw new Error(`Clipboard write failed: ${readError(error)}`);
    }
  }
  throw new Error(`Clipboard write failed: ${readError(nativeError)}`);
}

export function nativeClipboardCommands(platform: NodeJS.Platform): Array<{
  command: string;
  args: readonly string[];
}> {
  if (platform === "win32") {
    return [{
      command: "powershell.exe",
      args: ["-NonInteractive", "-NoProfile", "-Command", WINDOWS_CLIPBOARD_SCRIPT],
    }];
  }
  if (platform === "darwin") return [{ command: "pbcopy", args: [] }];
  return [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ];
}

async function runClipboardCommand(command: string, args: readonly string[], text: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out.`));
    }, CLIPBOARD_TIMEOUT_MS);
    timeout.unref?.();
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
    child.stdin.end(text);
  });
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "no clipboard provider is available");
}
