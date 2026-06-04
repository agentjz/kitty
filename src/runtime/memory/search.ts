import fs from "node:fs/promises";

import { listRuntimeMemoryAssets } from "./store.js";
import type { RuntimeMemoryAssetSearchResult } from "./types.js";

export async function searchRuntimeMemoryAssets(rootDir: string, query: string): Promise<RuntimeMemoryAssetSearchResult[]> {
  const needle = normalizeSearchText(query);
  if (!needle) {
    return [];
  }

  const results: RuntimeMemoryAssetSearchResult[] = [];
  for (const asset of await listRuntimeMemoryAssets(rootDir)) {
    const content = await fs.readFile(asset.absolutePath, "utf8");
    const matches = content
      .split(/\r?\n/)
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => normalizeSearchText(line).includes(needle))
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

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
