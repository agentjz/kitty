import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import { KITTY_BASE_ENV, KITTY_ENV } from "./envKeys.js";
import { getProviderPresetBaseUrl, PROVIDER_PRESETS } from "./providerPresets.js";
import { resolveModelProfile } from "../provider/catalog.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../i18n/index.js";
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
    providerProfile?: string;
    modelProfile?: string;
    wireApi?: string;
    catalogError?: string;
    provider: string;
    model: string;
    baseUrl: string;
    apiKeyPresent: boolean;
  };
  ready: boolean;
  nextSteps: ConfigPreflightNextStep[];
}

export type ConfigPreflightNextStep =
  | "run_init"
  | "fill_missing"
  | "set_api_key"
  | "rerun_doctor"
  | "verify_provider"
  | "start_kitty"
  | "review_env";

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
  const catalog = readCatalogProfile({ provider, model });

  const ready = files.every((file) => file.exists) && missingKeys.length === 0 && !catalog.error;
  return {
    rootDir: normalizedRoot,
    kittyDir,
    files,
    env: {
      activeKeys,
      missingKeys,
      providerPreset,
      providerProfile: catalog.providerProfile,
      modelProfile: catalog.modelProfile,
      wireApi: catalog.wireApi,
      catalogError: catalog.error,
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

export function formatConfigPreflightReport(
  report: ConfigPreflightReport,
  locale: KittyLocale = DEFAULT_LOCALE,
): string[] {
  return [
    `${translate(locale, "preflight.project")}: ${report.rootDir}`,
    `${translate(locale, "preflight.state")}: ${report.kittyDir}`,
    ...report.files.map((file) => `${translate(locale, "preflight.file")}: ${translate(locale, file.exists ? "common.ok" : "common.missing")} ${file.path}`),
    `${translate(locale, "preflight.envKeys")}: ${translate(locale, "preflight.activeExpected", { active: report.env.activeKeys.length, expected: readExpectedEnvKeys().length })}`,
    `${translate(locale, "preflight.missingKeys")}: ${report.env.missingKeys.length > 0 ? report.env.missingKeys.join(", ") : translate(locale, "common.none")}`,
    `${translate(locale, "preflight.provider")}: ${report.env.provider || translate(locale, "common.missing")}`,
    `${translate(locale, "preflight.model")}: ${report.env.model || translate(locale, "common.missing")}`,
    `${translate(locale, "preflight.baseUrl")}: ${report.env.baseUrl || translate(locale, "common.missing")}`,
    `${translate(locale, "preflight.providerPreset")}: ${formatProviderPresetFact(report, locale)}`,
    `${translate(locale, "preflight.providerProfile")}: ${report.env.providerProfile ?? translate(locale, "common.unresolved")}`,
    `${translate(locale, "preflight.modelProfile")}: ${report.env.modelProfile ?? translate(locale, "common.unresolved")}`,
    `${translate(locale, "preflight.wireApi")}: ${report.env.wireApi ?? translate(locale, "common.unresolved")}`,
    `${translate(locale, "preflight.catalog")}: ${report.env.catalogError ?? translate(locale, "common.ok")}`,
    `${translate(locale, "preflight.apiKey")}: ${translate(locale, report.env.apiKeyPresent ? "common.present" : "common.missing")}`,
    `${translate(locale, "preflight.status")}: ${translate(locale, report.ready ? "common.ready" : "common.notReady")}`,
    `${translate(locale, "preflight.next")}:`,
    ...report.nextSteps.map((step) => `- ${formatPreflightNextStep(step, locale)}`),
  ];
}

function buildPreflightNextSteps(input: {
  filesReady: boolean;
  missingKeys: readonly string[];
  apiKeyPresent: boolean;
  ready: boolean;
}): ConfigPreflightNextStep[] {
  if (!input.filesReady) {
    return ["run_init"];
  }
  if (input.missingKeys.length > 0) {
    return ["fill_missing", "rerun_doctor"];
  }
  if (!input.apiKeyPresent) {
    return ["set_api_key", "rerun_doctor"];
  }
  if (input.ready) {
    return ["verify_provider", "start_kitty"];
  }
  return ["review_env", "rerun_doctor"];
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
    getProviderPresetBaseUrl(preset) === input.baseUrl,
  )?.label;
}

function readCatalogProfile(input: {
  provider: string;
  model: string;
}): {
  providerProfile?: string;
  modelProfile?: string;
  wireApi?: string;
  error?: string;
} {
  if (!input.provider || !input.model) {
    return {};
  }

  try {
    const profile = resolveModelProfile(input);
    return {
      providerProfile: profile.provider.label,
      modelProfile: profile.model.label,
      wireApi: profile.model.wireApi,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatProviderPresetFact(report: ConfigPreflightReport, locale: KittyLocale): string {
  if (report.env.providerPreset) {
    return report.env.providerPreset;
  }
  if (report.env.provider || report.env.model || report.env.baseUrl) {
    return translate(locale, "common.custom");
  }
  return translate(locale, "common.missing");
}

function formatPreflightNextStep(step: ConfigPreflightNextStep, locale: KittyLocale): string {
  const key = {
    run_init: "preflight.runInit",
    fill_missing: "preflight.fillMissing",
    set_api_key: "preflight.setApiKey",
    rerun_doctor: "preflight.rerunDoctor",
    verify_provider: "preflight.verifyProvider",
    start_kitty: "preflight.startKitty",
    review_env: "preflight.reviewEnv",
  } as const;
  return translate(locale, key[step]);
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
