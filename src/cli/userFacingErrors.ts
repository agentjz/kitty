import path from "node:path";

import { ConfigError } from "../config/errors.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
} from "../project/statePaths.js";

export function formatCliSetupError(error: unknown, cwd = process.cwd()): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const envFile = path.join(path.resolve(cwd), PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME);

  if (error instanceof ConfigError) {
    return [
      "Project is not ready to run.",
      "Create or repair the project template with: kitty init",
      `Config file: ${envFile}`,
      "Then fill required values and run: kitty doctor",
      `Original error: ${message}`,
    ].join("\n");
  }

  if (isMissingRuntimeEnvError(message)) {
    return [
      "Project is not ready to run.",
      `Create or repair the project template with: kitty init`,
      `Config file: ${envFile}`,
      `Then fill required values and run: kitty doctor`,
      `Original error: ${message}`,
    ].join("\n");
  }

  if (isMissingApiKeyError(message)) {
    return [
      "Provider API key is missing.",
      `Set KITTY_API_KEY in: ${envFile}`,
      "Then run: kitty doctor",
    ].join("\n");
  }

  return undefined;
}

function isMissingRuntimeEnvError(message: string): boolean {
  return /Missing or invalid KITTY_[A-Z0-9_]+ in the project's \.kitty\/\.env file\./u.test(message) ||
    /Missing config value:/u.test(message) ||
    /Missing agent profile/u.test(message);
}

function isMissingApiKeyError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("api key not found") ||
    lower.includes("api key missing") ||
    lower.includes("no api key found") ||
    lower.includes("set `kitty_api_key`");
}
