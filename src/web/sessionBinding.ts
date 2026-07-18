import fs from "node:fs/promises";
import path from "node:path";

export class WebSessionBindingStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<string | null> {
    let value: { sessionId?: string } | null;
    try {
      value = JSON.parse(await fs.readFile(this.filePath, "utf8")) as { sessionId?: string };
    } catch {
      value = null;
    }
    return typeof value?.sessionId === "string" && value.sessionId.trim() ? value.sessionId.trim() : null;
  }

  async save(sessionId: string): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify({ sessionId })}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, this.filePath);
  }
}
