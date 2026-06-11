import fs from "node:fs/promises";

import { listRuntimeMemoryAssets } from "./store.js";
import type { RuntimeMemoryAssetSearchResult } from "./types.js";

export async function searchRuntimeMemoryAssets(rootDir: string, query: string): Promise<RuntimeMemoryAssetSearchResult[]> {
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const results: RuntimeMemoryAssetSearchResult[] = [];
  for (const asset of await listRuntimeMemoryAssets(rootDir)) {
    const content = await fs.readFile(asset.absolutePath, "utf8");
    const body = [
      asset.id,
      asset.kind,
      asset.title,
      asset.scope,
      asset.tags.join(" "),
      asset.evidenceRefs.join(" "),
      content,
    ].filter(Boolean).join("\n");
    if (!queryTokens.every((token) => normalizeSearchText(body).includes(token))) {
      continue;
    }

    const matches = content
      .split(/\r?\n/)
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => {
        const normalized = normalizeSearchText(line);
        return queryTokens.some((token) => normalized.includes(token));
      })
      .map(({ line, index }) => `${index + 1}: ${line}`)
      .slice(0, 5);

    results.push({
      ...asset,
      score: scoreMemoryAsset(body, queryTokens),
      matches,
    });
  }
  return results.sort((left, right) =>
    right.score - left.score ||
    (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenizeSearchText(value: string): string[] {
  return [...new Set(normalizeSearchText(value).split(/[\s,;，；、]+/).filter(Boolean))];
}

function scoreMemoryAsset(body: string, tokens: string[]): number {
  const normalized = normalizeSearchText(body);
  return tokens.reduce((score, token) => score + countOccurrences(normalized, token), 0);
}

function countOccurrences(value: string, token: string): number {
  let count = 0;
  let index = value.indexOf(token);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(token, index + token.length);
  }
  return count;
}
