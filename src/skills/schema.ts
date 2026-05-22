import path from "node:path";

import type { LoadedSkill } from "../types.js";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class SkillSchemaError extends Error {
  constructor(message: string, readonly filePath: string) {
    super(`${message} (${filePath})`);
    this.name = "SkillSchemaError";
  }
}

export function parseSkillSource(
  text: string,
  input: {
    absolutePath: string;
    rootDir: string;
  },
): LoadedSkill {
  const normalized = text.replace(/^\uFEFF/, "");
  const match = normalized.match(FRONTMATTER_PATTERN);
  const frontmatter = match?.[1] ?? "";
  const body = (match?.[2] ?? normalized).trim();
  const metadata = parseSimpleFrontmatter(frontmatter);
  const name = readRequiredText(metadata.name, "name", input.absolutePath);
  const description = readRequiredText(metadata.description, "description", input.absolutePath);

  return {
    name,
    description,
    path: path.relative(input.rootDir, input.absolutePath) || "SKILL.md",
    absolutePath: input.absolutePath,
    body,
    resources: [],
  };
}

function parseSimpleFrontmatter(frontmatter: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

function readRequiredText(value: string | undefined, key: string, filePath: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new SkillSchemaError(`Skill metadata field "${key}" is required.`, filePath);
  }
  return normalized;
}
