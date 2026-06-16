import fs from "node:fs/promises";
import path from "node:path";

import { discoverSkills } from "../../skills/discovery.js";
import { loadProjectIgnoreRules } from "../../utils/ignore.js";
import type { RuntimeMemoryAsset } from "./types.js";
import { readRuntimeMemoryAsset } from "./store.js";

export async function appendRuntimeMemoryAssetToSkillReference(input: {
  rootDir: string;
  memoryId: string;
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
  const memory = await readRuntimeMemoryAsset(input.rootDir, input.memoryId);
  const ignoreRules = await loadProjectIgnoreRules(input.rootDir, input.rootDir);
  const skill = (await discoverSkills(input.rootDir, input.rootDir, ignoreRules))
    .find((item) => item.name === input.skillName);
  if (!skill) {
    throw new Error(`Unknown runtime skill: ${input.skillName}`);
  }

  const skillDir = path.dirname(skill.absolutePath);
  const referencesDir = path.join(skillDir, "references");
  const fileName = input.fileName?.trim() || `runtime-memory-${sanitizeMemoryFileName(input.memoryId)}.md`;
  const targetPath = path.join(referencesDir, fileName);
  await fs.mkdir(referencesDir, { recursive: true });
  await fs.writeFile(targetPath, [
    `# Runtime memory ${input.memoryId}`,
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

function sanitizeMemoryFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "memory";
}
