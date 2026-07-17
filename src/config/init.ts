import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

import { buildProjectEnvTemplate } from "./projectEnvTemplate.js";
import { getDefaultKittyIgnoreContent } from "../utils/ignore.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_EXAMPLE_FILE_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
  PROJECT_STATE_IGNORE_FILE_NAME,
} from "../project/statePaths.js";
import { inspectConfigPreflight, type ConfigPreflightReport } from "./preflight.js";
import { atomicWriteFile } from "../utils/fs.js";

export interface InitProjectResult {
  created: string[];
  updated: string[];
  skipped: string[];
  preflight: ConfigPreflightReport;
}

export async function initializeProjectFiles(cwd: string): Promise<InitProjectResult> {
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  const kittyDir = path.join(cwd, PROJECT_STATE_DIR_NAME);
  const envPath = path.join(kittyDir, PROJECT_STATE_ENV_FILE_NAME);
  const envExamplePath = path.join(kittyDir, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME);
  const ignorePath = path.join(kittyDir, PROJECT_STATE_IGNORE_FILE_NAME);
  const envTemplate = buildProjectEnvTemplate(false);
  const envExampleTemplate = buildProjectEnvTemplate(true);

  await fs.mkdir(kittyDir, { recursive: true });

  await reconcileEnvFile(envPath, envTemplate, { created, updated, skipped });
  await reconcileEnvFile(envExamplePath, envExampleTemplate, { created, updated, skipped });

  if (await fileExists(ignorePath)) {
    skipped.push(ignorePath);
  } else {
    await fs.writeFile(ignorePath, getDefaultKittyIgnoreContent(), "utf8");
    created.push(ignorePath);
  }

  return {
    created,
    updated,
    skipped,
    preflight: await inspectConfigPreflight(cwd),
  };
}

async function reconcileEnvFile(
  filePath: string,
  template: string,
  result: Pick<InitProjectResult, "created" | "updated" | "skipped">,
): Promise<void> {
  if (!await fileExists(filePath)) {
    await fs.writeFile(filePath, template, "utf8");
    result.created.push(filePath);
    return;
  }

  const current = await fs.readFile(filePath, "utf8");
  const currentValues = dotenv.parse(current);
  const missingEntries = Object.entries(dotenv.parse(template))
    .filter(([key]) => !(key in currentValues));
  if (missingEntries.length === 0) {
    result.skipped.push(filePath);
    return;
  }

  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  const addition = [
    "",
    "# Added by kitty init",
    ...missingEntries.map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
  await atomicWriteFile(filePath, `${current}${separator}${addition}`);
  result.updated.push(filePath);
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
