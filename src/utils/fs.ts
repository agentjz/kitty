import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function resolveUserPath(inputPath: string, cwd: string): string {
  const cleanPath = normalizeUserPathInput(inputPath);
  if (path.isAbsolute(cleanPath)) {
    return path.normalize(cleanPath);
  }

  return path.resolve(cwd, cleanPath);
}

export function normalizeUserPathInput(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

export async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function atomicWriteFile(filePath: string, content: string | Uint8Array): Promise<void> {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  const temporary = await fs.open(temporaryPath, "wx");
  try {
    await temporary.writeFile(content);
    await temporary.sync();
  } finally {
    await temporary.close();
  }
  try {
    await fs.rename(temporaryPath, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(directory, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" || !["EISDIR", "EINVAL", "EPERM", "EACCES"].includes(code ?? "")) throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function sha256Content(content: string | Uint8Array): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function truncateText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars)}\n\n... [truncated ${input.length - maxChars} chars]`;
}

export function formatFileWithLineNumbers(content: string, startLine = 1): string {
  return content
    .split(/\r?\n/)
    .map((line, index) => `${String(startLine + index).padStart(4, " ")} | ${line}`)
    .join("\n");
}
