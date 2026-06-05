import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../../project/statePaths.js";
import { SessionStore } from "../../session/store.js";
import type { RuntimeMemoryAsset, RuntimeMemoryAssetContent, RuntimeMemoryAssetKind } from "./types.js";

export async function listRuntimeMemoryAssets(rootDir: string): Promise<RuntimeMemoryAsset[]> {
  const paths = getProjectStatePaths(rootDir);
  const assets = (await Promise.all([
    listMemoryAssetsInDirectory(paths.rootDir, paths.evidenceMemoryDir, "evidence"),
    listMemoryAssetsInDirectory(paths.rootDir, paths.projectMemoryDir, "project"),
    listMemoryAssetsInDirectory(paths.rootDir, paths.sessionMemoryDir, "session"),
    listMemoryAssetsInDirectory(paths.rootDir, paths.userMemoryDir, "user"),
  ])).flat();

  return assets.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}

export async function readRuntimeMemoryAsset(rootDir: string, memoryId: string): Promise<RuntimeMemoryAssetContent> {
  const asset = await findRuntimeMemoryAsset(rootDir, memoryId);
  return {
    ...asset,
    content: await fs.readFile(asset.absolutePath, "utf8"),
  };
}

export async function deleteRuntimeMemoryAsset(rootDir: string, memoryId: string): Promise<RuntimeMemoryAsset> {
  const paths = getProjectStatePaths(rootDir);
  const asset = await findRuntimeMemoryAsset(rootDir, memoryId);
  if (asset.kind !== "session") {
    await fs.rm(asset.absolutePath, { force: true });
    return asset;
  }

  const sessionStore = new SessionStore(paths.sessionsDir, {
    memorySessionsDir: paths.sessionMemoryDir,
  });
  const session = await sessionStore.load(memoryId).catch(() => undefined);
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

async function findRuntimeMemoryAsset(rootDir: string, memoryId: string): Promise<RuntimeMemoryAsset> {
  const asset = (await listRuntimeMemoryAssets(rootDir)).find((item) => item.id === memoryId);
  if (!asset) {
    throw new Error(`Unknown runtime memory asset: ${memoryId}`);
  }
  return asset;
}

async function listMemoryAssetsInDirectory(
  rootDir: string,
  memoryDir: string,
  kind: RuntimeMemoryAssetKind,
): Promise<RuntimeMemoryAsset[]> {
  const entries = await fs.readdir(memoryDir, { withFileTypes: true }).catch(() => []);
  const assets = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(async (entry) => {
      const absolutePath = path.join(memoryDir, entry.name);
      const stat = await fs.stat(absolutePath);
      const body = await fs.readFile(absolutePath, "utf8").catch(() => "");
      const basename = entry.name.slice(0, -".md".length);
      const id = kind === "session" ? basename : `${kind}/${basename}`;
      return {
        id,
        kind,
        path: path.relative(rootDir, absolutePath),
        absolutePath,
        updatedAt: stat.mtime.toISOString(),
        size: stat.size,
        evidenceRefs: readEvidenceRefs(body, kind, basename),
      };
    }));

  return assets;
}

function readEvidenceRefs(body: string, kind: RuntimeMemoryAssetKind, basename: string): string[] {
  const refs = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith("evidence:"))
    .flatMap((line) => line.slice("Evidence:".length).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (refs.length > 0) {
    return [...new Set(refs)];
  }
  return kind === "session" ? [`session:${basename}`] : [];
}
