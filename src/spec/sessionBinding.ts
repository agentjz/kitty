import fs from "node:fs/promises";
import path from "node:path";

import { getSpecSessionBindingFile } from "./layout.js";
import type { SpecSessionBinding } from "./types.js";

export class SpecSessionBindingStore {
  constructor(private readonly stateRootDir: string) {}

  async bind(sessionId: string, specId: string): Promise<SpecSessionBinding> {
    const binding: SpecSessionBinding = {
      schemaVersion: 1,
      sessionId,
      specId,
      updatedAt: new Date().toISOString(),
    };
    const file = getSpecSessionBindingFile(this.stateRootDir, sessionId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(binding, null, 2)}\n`, "utf8");
    return binding;
  }

  async load(sessionId: string): Promise<SpecSessionBinding | null> {
    try {
      const raw = await fs.readFile(getSpecSessionBindingFile(this.stateRootDir, sessionId), "utf8");
      const parsed = JSON.parse(raw) as SpecSessionBinding;
      if (parsed.schemaVersion !== 1 || parsed.sessionId !== sessionId || typeof parsed.specId !== "string") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
