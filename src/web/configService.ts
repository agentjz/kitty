import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

import { inspectConfigPreflight } from "../config/preflight.js";
import { KITTY_BASE_ENV, KITTY_ENV } from "../config/envKeys.js";
import { resolveRuntimeConfig } from "../config/runtime.js";
import { PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME } from "../project/statePaths.js";
import { atomicWriteFile } from "../utils/fs.js";

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
  ...Object.values(KITTY_BASE_ENV),
  ...Object.values(KITTY_ENV.extensions),
]);
const SECRET_KEYS: ReadonlySet<string> = new Set<string>([KITTY_ENV.apiKey, KITTY_ENV.telegramToken]);

export class WebConfigService {
  private readonly envPath: string;

  constructor(private readonly cwd: string) {
    this.envPath = path.join(cwd, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME);
  }

  async read(): Promise<{ file: string; values: Record<string, string> }> {
    const parsed = dotenv.parse(await fs.readFile(this.envPath, "utf8"));
    const values: Record<string, string> = {};
    for (const key of KNOWN_KEYS) {
      values[key] = parsed[key] ?? "";
    }
    return {
      file: `${PROJECT_STATE_DIR_NAME}/${PROJECT_STATE_ENV_FILE_NAME}`,
      values,
    };
  }

  async save(input: { values?: Record<string, unknown>; clear?: string[] }): Promise<ReturnType<WebConfigService["read"]> extends Promise<infer T> ? T : never> {
    const values = input.values ?? {};
    const clear = new Set(input.clear ?? []);
    for (const key of [...Object.keys(values), ...clear]) {
      if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown Kitty environment key: ${key}.`);
    }
    const updates: Record<string, string> = {};
    for (const [key, raw] of Object.entries(values)) {
      if (SECRET_KEYS.has(key) && (raw === "" || raw === undefined || raw === null)) continue;
      const value = String(raw ?? "");
      if (/[\r\n]/.test(value)) throw new Error(`Environment value ${key} must be one line.`);
      updates[key] = value;
    }
    for (const key of clear) updates[key] = "";

    const current = await fs.readFile(this.envPath, "utf8");
    const lines = current.split(/\r?\n/);
    const consumed = new Set<string>();
    const next = lines.map((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
      const key = match?.[1];
      if (!key || !(key in updates)) return line;
      consumed.add(key);
      return `${key}=${encodeEnvValue(updates[key]!)}`;
    });
    for (const [key, value] of Object.entries(updates)) {
      if (!consumed.has(key)) next.push(`${key}=${encodeEnvValue(value)}`);
    }
    await atomicWriteFile(this.envPath, `${next.join("\n").replace(/\n+$/u, "")}\n`);
    await resolveRuntimeConfig({ cwd: this.cwd });
    return this.read();
  }

  async preflight() {
    return inspectConfigPreflight(this.cwd);
  }
}

function encodeEnvValue(value: string): string {
  return /^[^\s#='"\\]+$/u.test(value) || value === ""
    ? value
    : JSON.stringify(value);
}
