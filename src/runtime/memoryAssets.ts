import fs from "node:fs/promises";
import path from "node:path";

import { discoverSkills } from "../skills/discovery.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { SessionStore } from "../session/store.js";
import { loadProjectIgnoreRules } from "../utils/ignore.js";

export interface RuntimeMemoryAsset {
  sessionId: string;
  path: string;
  absolutePath: string;
  updatedAt?: string;
  size: number;
}

export async function listRuntimeMemoryAssets(rootDir: string): Promise<RuntimeMemoryAsset[]> {
  const paths = getProjectStatePaths(rootDir);
  const entries = await fs.readdir(paths.sessionMemoryDir, { withFileTypes: true }).catch(() => []);
  const assets = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(async (entry) => {
      const absolutePath = path.join(paths.sessionMemoryDir, entry.name);
      const stat = await fs.stat(absolutePath);
      return {
        sessionId: entry.name.slice(0, -".md".length),
        path: path.relative(paths.rootDir, absolutePath),
        absolutePath,
        updatedAt: stat.mtime.toISOString(),
        size: stat.size,
      };
    }));

  return assets.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}

export async function readRuntimeMemoryAsset(rootDir: string, sessionId: string): Promise<RuntimeMemoryAsset & {
  content: string;
}> {
  const asset = (await listRuntimeMemoryAssets(rootDir)).find((item) => item.sessionId === sessionId);
  if (!asset) {
    throw new Error(`Unknown session memory asset: ${sessionId}`);
  }

  return {
    ...asset,
    content: await fs.readFile(asset.absolutePath, "utf8"),
  };
}

export async function deleteRuntimeMemoryAsset(rootDir: string, sessionId: string): Promise<RuntimeMemoryAsset> {
  const paths = getProjectStatePaths(rootDir);
  const asset = (await listRuntimeMemoryAssets(rootDir)).find((item) => item.sessionId === sessionId);
  if (!asset) {
    throw new Error(`Unknown session memory asset: ${sessionId}`);
  }

  const sessionStore = new SessionStore(paths.sessionsDir, {
    memorySessionsDir: paths.sessionMemoryDir,
  });
  const session = await sessionStore.load(sessionId).catch(() => undefined);
  if (session) {
    await sessionStore.save({
      ...session,
      sessionMemory: undefined,
    });
    return asset;
  }

  await fs.rm(asset.absolutePath, { force: true });
  return asset;
}

export async function appendRuntimeMemoryAssetToSpecNotes(input: {
  rootDir: string;
  sessionId: string;
  specId: string;
  heading?: string;
}): Promise<{
  memory: RuntimeMemoryAsset;
  specId: string;
  path: string;
}> {
  const { SpecStore } = await import("../spec/store.js");
  const memory = await readRuntimeMemoryAsset(input.rootDir, input.sessionId);
  const result = await new SpecStore(input.rootDir, {
    rootDir: input.rootDir,
  }).appendNote(input.specId, {
    heading: input.heading ?? `Session memory ${input.sessionId}`,
    content: [
      `Source memory asset: ${memory.path}`,
      "",
      memory.content.trim(),
    ].join("\n"),
  });
  return {
    memory,
    specId: input.specId,
    path: result.path,
  };
}

export async function appendRuntimeMemoryAssetToSkillReference(input: {
  rootDir: string;
  sessionId: string;
  skillName: string;
  fileName?: string;
}): Promise<{
  memory: RuntimeMemoryAsset;
  skill: {
    name: string;
    path: string;
  };
  path: string;
}> {
  const memory = await readRuntimeMemoryAsset(input.rootDir, input.sessionId);
  const ignoreRules = await loadProjectIgnoreRules(input.rootDir, input.rootDir);
  const skill = (await discoverSkills(input.rootDir, input.rootDir, ignoreRules))
    .find((item) => item.name === input.skillName);
  if (!skill) {
    throw new Error(`Unknown runtime skill: ${input.skillName}`);
  }

  const skillDir = path.dirname(skill.absolutePath);
  const referencesDir = path.join(skillDir, "references");
  const fileName = input.fileName?.trim() || `session-memory-${sanitizeMemoryFileName(input.sessionId)}.md`;
  const targetPath = path.join(referencesDir, fileName);
  await fs.mkdir(referencesDir, { recursive: true });
  await fs.writeFile(targetPath, [
    `# Session memory ${input.sessionId}`,
    "",
    `Source memory asset: ${memory.path}`,
    "",
    memory.content.trim(),
    "",
  ].join("\n"), "utf8");

  return {
    memory,
    skill: {
      name: skill.name,
      path: skill.path,
    },
    path: path.relative(input.rootDir, targetPath),
  };
}

export async function searchRuntimeMemoryAssets(rootDir: string, query: string): Promise<Array<RuntimeMemoryAsset & {
  matches: string[];
}>> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  const results = [];
  for (const asset of await listRuntimeMemoryAssets(rootDir)) {
    const content = await fs.readFile(asset.absolutePath, "utf8");
    const lines = content.split(/\r?\n/);
    const matches = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => terms.some((term) => line.toLowerCase().includes(term)))
      .map(({ line, index }) => `${index + 1}: ${line}`)
      .slice(0, 5);
    if (matches.length > 0) {
      results.push({
        ...asset,
        matches,
      });
    }
  }
  return results;
}

function sanitizeMemoryFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "memory";
}
