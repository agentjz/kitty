import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../../project/statePaths.js";
import { renderRuntimeMemoryAssetDocument } from "./metadata.js";
import type { CreateRuntimeMemoryAssetInput, RuntimeMemoryAsset, WritableRuntimeMemoryAssetKind } from "./types.js";
import { readRuntimeMemoryAsset } from "./store.js";

export async function createRuntimeMemoryAsset(input: CreateRuntimeMemoryAssetInput): Promise<RuntimeMemoryAsset> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const memoryDir = readWritableMemoryDir(input.rootDir, input.kind);
  const fileName = `${sanitizeMemoryFileStem(input.fileName?.trim() || input.title)}.md`;
  const absolutePath = path.join(memoryDir, fileName);

  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(absolutePath, renderRuntimeMemoryAssetDocument({
    kind: input.kind,
    title: input.title,
    content: input.content,
    evidenceRefs: input.evidenceRefs,
    scope: input.scope,
    tags: input.tags,
    timestamp,
  }), { encoding: "utf8", flag: "wx" });

  return readRuntimeMemoryAsset(input.rootDir, `${input.kind}/${fileName.slice(0, -".md".length)}`);
}

function readWritableMemoryDir(rootDir: string, kind: WritableRuntimeMemoryAssetKind): string {
  const paths = getProjectStatePaths(rootDir);
  switch (kind) {
    case "evidence":
      return paths.evidenceMemoryDir;
    case "project":
      return paths.projectMemoryDir;
    case "user":
      return paths.userMemoryDir;
  }
}

function sanitizeMemoryFileStem(value: string): string {
  const normalized = value
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "memory";
}
