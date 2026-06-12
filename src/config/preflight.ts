import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import { KITTY_BASE_ENV, KITTY_ENV } from "./envKeys.js";
import { PROVIDER_PRESETS } from "./providerPresets.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_EXAMPLE_FILE_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
  PROJECT_STATE_IGNORE_FILE_NAME,
} from "../project/statePaths.js";

export interface ConfigPreflightReport {
  rootDir: string;
  kittyDir: string;
  files: ConfigPreflightFile[];
  env: {
    activeKeys: string[];
    missingKeys: string[];
    providerPreset?: string;
    provider: string;
    model: string;
    baseUrl: string;
    apiKeyPresent: boolean;
  };
  ready: boolean;
  nextSteps: string[];
}

export interface ConfigPreflightFile {
  path: string;
  exists: boolean;
}

export async function inspectConfigPreflight(rootDir: string): Promise<ConfigPreflightReport> {
  const normalizedRoot = path.resolve(rootDir);
  const kittyDir = path.join(normalizedRoot, PROJECT_STATE_DIR_NAME);
  const envPath = path.join(kittyDir, PROJECT_STATE_ENV_FILE_NAME);
  const files = await Promise.all([
    inspectFile(kittyDir),
    inspectFile(envPath),
    inspectFile(path.join(kittyDir, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME)),
    inspectFile(path.join(kittyDir, PROJECT_STATE_IGNORE_FILE_NAME)),
  ]);
  const parsedEnv = await readEnvFile(envPath);
  const expectedKeys = readExpectedEnvKeys();
  const activeKeys = Object.keys(parsedEnv).sort();
  const missingKeys = expectedKeys.filter((key) => !(key in parsedEnv));
  const provider = parsedEnv[KITTY_ENV.provider] ?? "";
  const model = parsedEnv[KITTY_ENV.model] ?? "";
  const baseUrl = parsedEnv[KITTY_ENV.baseUrl] ?? "";
  const providerPreset = readProviderPresetLabel({ provider, model, baseUrl });

  const ready = files.every((file) => file.exists) && missingKeys.length === 0;
  return {
    rootDir: normalizedRoot,
    kittyDir,
    files,
    env: {
      activeKeys,
      missingKeys,
      providerPreset,
      provider,
      model,
      baseUrl,
      apiKeyPresent: Boolean(parsedEnv[KITTY_ENV.apiKey]?.trim()),
    },
    ready,
    nextSteps: buildPreflightNextSteps({
      filesReady: files.every((file) => file.exists),
      missingKeys,
      apiKeyPresent: Boolean(parsedEnv[KITTY_ENV.apiKey]?.trim()),
      ready,
    }),
  };
}

export function formatConfigPreflightReport(report: ConfigPreflightReport): string[] {
  return [
    `project: ${report.rootDir}`,
    `state: ${report.kittyDir}`,
    ...report.files.map((file) => `file: ${file.exists ? "ok" : "missing"} ${file.path}`),
    `env keys: ${report.env.activeKeys.length} active / ${readExpectedEnvKeys().length} expected`,
    report.env.missingKeys.length > 0 ? `missing keys: ${report.env.missingKeys.join(", ")}` : "missing keys: none",
    `provider: ${report.env.provider || "(missing)"}`,
    `model: ${report.env.model || "(missing)"}`,
    `baseUrl: ${report.env.baseUrl || "(missing)"}`,
    `provider preset: ${formatProviderPresetFact(report)}`,
    `api key: ${report.env.apiKeyPresent ? "present" : "missing"}`,
    `preflight: ${report.ready ? "ready" : "not_ready"}`,
    "next:",
    ...report.nextSteps.map((step) => `- ${step}`),
  ];
}

function buildPreflightNextSteps(input: {
  filesReady: boolean;
  missingKeys: readonly string[];
  apiKeyPresent: boolean;
  ready: boolean;
}): string[] {
  if (!input.filesReady) {
    return ["run `kitty init` to create the local .kitty files"];
  }
  if (input.missingKeys.length > 0) {
    return ["open `.kitty/.env` and fill the missing keys", "rerun `kitty doctor`"];
  }
  if (!input.apiKeyPresent) {
    return ["set `KITTY_API_KEY` in `.kitty/.env`", "rerun `kitty doctor`"];
  }
  if (input.ready) {
    return ["run `kitty doctor` to verify provider connectivity", "start Kitty with `kitty`"];
  }
  return ["review `.kitty/.env`", "rerun `kitty doctor`"];
}

function readExpectedEnvKeys(): string[] {
  return [
    ...Object.values(KITTY_BASE_ENV),
    ...Object.values(KITTY_ENV.extensions),
  ].sort();
}

async function inspectFile(targetPath: string): Promise<ConfigPreflightFile> {
  return {
    path: targetPath,
    exists: await exists(targetPath),
  };
}

async function readEnvFile(envPath: string): Promise<Record<string, string>> {
  try {
    return dotenv.parse(await fs.readFile(envPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function readProviderPresetLabel(input: {
  provider: string;
  model: string;
  baseUrl: string;
}): string | undefined {
  return PROVIDER_PRESETS.find((preset) =>
    preset.provider === input.provider &&
    preset.model === input.model &&
    preset.baseUrl === input.baseUrl,
  )?.label;
}

function formatProviderPresetFact(report: ConfigPreflightReport): string {
  if (report.env.providerPreset) {
    return report.env.providerPreset;
  }
  if (report.env.provider || report.env.model || report.env.baseUrl) {
    return "custom";
  }
  return "missing";
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
