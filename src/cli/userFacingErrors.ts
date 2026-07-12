import path from "node:path";

import { ConfigError } from "../config/errors.js";
import { KITTY_ENV } from "../config/envKeys.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../i18n/index.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
} from "../project/statePaths.js";

export function formatCliSetupError(
  error: unknown,
  cwd = process.cwd(),
  locale: KittyLocale = DEFAULT_LOCALE,
): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const envFile = path.join(path.resolve(cwd), PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME);

  if (error instanceof ConfigError) {
    if (error.key === KITTY_ENV.apiKey) {
      return [
        translate(locale, "cli.setup.apiKeyMissing"),
        translate(locale, "cli.setup.setApiKey", { path: envFile }),
        translate(locale, "cli.setup.thenRestart"),
      ].join("\n");
    }
    return [
      translate(locale, "cli.setup.projectNotReady"),
      translate(locale, "cli.setup.createTemplate"),
      translate(locale, "cli.setup.configFile", { path: envFile }),
      translate(locale, "cli.setup.fillAndStart"),
      translate(locale, "cli.setup.originalError", { error: message }),
    ].join("\n");
  }

  return undefined;
}
