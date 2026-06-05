import fs from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";
import fg from "fast-glob";

import type { ProjectMap } from "../types.js";

const IGNORED_TOP_LEVEL = new Set([
  ".git",
  ".kitty",
  "dist",
  "node_modules",
  ".test-build",
  "ref",
]);

const ENTRY_FILE_CANDIDATES = [
  "src/cli.ts",
  "src/index.ts",
  "src/main.ts",
  "src/cli.js",
  "src/index.js",
  "index.ts",
  "index.js",
  "cli.ts",
  "cli.js",
] as const;

const TEST_DIRECTORY_CANDIDATES = [
  "tests",
  "test",
  "__tests__",
] as const;

export async function buildProjectMap(rootDir: string, cwd = rootDir): Promise<ProjectMap> {
  const normalizedRoot = path.resolve(rootDir);
  const [topLevelDirectories, packageScripts, entryFiles, testDirectories, specDocuments, git] = await Promise.all([
    readTopLevelDirectories(normalizedRoot),
    readPackageScripts(normalizedRoot),
    readEntryFiles(normalizedRoot),
    readTestDirectories(normalizedRoot),
    readSpecDocuments(normalizedRoot),
    readGitFacts(normalizedRoot),
  ]);

  const map: Omit<ProjectMap, "summary"> = {
    rootDir: normalizedRoot,
    cwd: path.resolve(cwd),
    topLevelDirectories,
    entryFiles,
    testDirectories,
    packageScripts,
    specDocuments,
    git,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...map,
    summary: summarizeProjectMap(map),
  };
}

export function summarizeProjectMap(map: Omit<ProjectMap, "summary">): string {
  return [
    `Root: ${map.rootDir}`,
    `Top-level dirs: ${formatList(map.topLevelDirectories)}`,
    `Entries: ${formatList(map.entryFiles)}`,
    `Tests: ${formatList(map.testDirectories)}`,
    `Scripts: ${formatList(map.packageScripts)}`,
    `Specs: ${formatList(map.specDocuments)}`,
    `Git: ${map.git.available ? (map.git.hasChanges ? "available, changed" : "available, clean") : "unavailable"}`,
    map.git.recentChanges.length > 0 ? `Recent changes: ${formatList(map.git.recentChanges)}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

async function readTopLevelDirectories(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !IGNORED_TOP_LEVEL.has(name))
    .sort((left, right) => left.localeCompare(right));
}

async function readPackageScripts(rootDir: string): Promise<string[]> {
  const packagePath = path.join(rootDir, "package.json");
  const raw = await fs.readFile(packagePath, "utf8").catch(() => undefined);
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
  return Object.entries(parsed.scripts ?? {})
    .filter(([, value]) => typeof value === "string")
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
}

async function readEntryFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  for (const candidate of ENTRY_FILE_CANDIDATES) {
    if (await isFile(path.join(rootDir, candidate))) {
      results.push(candidate);
    }
  }
  return results;
}

async function readTestDirectories(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  for (const candidate of TEST_DIRECTORY_CANDIDATES) {
    if (await isDirectory(path.join(rootDir, candidate))) {
      results.push(candidate);
    }
  }
  return results;
}

async function readSpecDocuments(rootDir: string): Promise<string[]> {
  return fg("spec/**/*.md", {
    cwd: rootDir,
    dot: false,
    onlyFiles: true,
    unique: true,
  }).then((files) => files.sort((left, right) => left.localeCompare(right)).slice(0, 20)).catch(() => []);
}

async function readGitFacts(rootDir: string): Promise<ProjectMap["git"]> {
  const result = await execa("git", ["status", "--short"], {
    cwd: rootDir,
    all: true,
    reject: false,
    windowsHide: true,
  });
  if (result.exitCode !== 0) {
    return {
      available: false,
      hasChanges: false,
      recentChanges: [],
    };
  }

  const recentChanges = String(result.all ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  return {
    available: true,
    hasChanges: recentChanges.length > 0,
    recentChanges,
  };
}

async function isFile(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then((stat) => stat.isFile()).catch(() => false);
}

async function isDirectory(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then((stat) => stat.isDirectory()).catch(() => false);
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) {
    return "none";
  }
  const shown = values.slice(0, 8);
  return values.length > shown.length ? `${shown.join(", ")} (+${values.length - shown.length} more)` : shown.join(", ");
}
