import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../../project/statePaths.js";
import { SessionStore } from "../../session/store.js";
import type { RuntimeMemoryAsset, RuntimeMemoryAssetContent } from "./types.js";

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

export async function readRuntimeMemoryAsset(rootDir: string, sessionId: string): Promise<RuntimeMemoryAssetContent> {
  const asset = await findRuntimeMemoryAsset(rootDir, sessionId);
  return {
    ...asset,
    content: await fs.readFile(asset.absolutePath, "utf8"),
  };
}

export async function deleteRuntimeMemoryAsset(rootDir: string, sessionId: string): Promise<RuntimeMemoryAsset> {
  const paths = getProjectStatePaths(rootDir);
  const asset = await findRuntimeMemoryAsset(rootDir, sessionId);
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

async function findRuntimeMemoryAsset(rootDir: string, sessionId: string): Promise<RuntimeMemoryAsset> {
  const asset = (await listRuntimeMemoryAssets(rootDir)).find((item) => item.sessionId === sessionId);
  if (!asset) {
    throw new Error(`Unknown session memory asset: ${sessionId}`);
  }
  return asset;
}
