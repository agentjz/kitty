import path from "node:path";

import type { LoadedSkill } from "../types.js";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export const STANDARD_SKILLS_DIR_NAME = "skills";
export const SKILL_FILE_NAME = "SKILL.md";
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

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
  const name = validateSkillName(readRequiredText(metadata.name, "name", input.absolutePath), input.absolutePath);
  const description = readRequiredText(metadata.description, "description", input.absolutePath);

  return {
    name,
    description,
    path: path.relative(input.rootDir, input.absolutePath) || "SKILL.md",
    absolutePath: input.absolutePath,
    body,
    dependencies: parseDependencies(metadata.requires),
    resources: [],
    health: {
      status: body ? "ready" : "needs_content",
      bodyPresent: Boolean(body),
      resourceCount: 0,
      dependencyCount: 0,
      resourceGroups: {
        references: 0,
        scripts: 0,
        examples: 0,
        assets: 0,
        other: 0,
      },
      issues: body ? [] : ["SKILL.md body is empty"],
    },
  };
}

export function validateSkillName(input: string, filePath?: string): string {
  const name = input.trim();
  if (SKILL_NAME_PATTERN.test(name)) {
    return name;
  }
  const message = "Skill name must use 1-64 lowercase letters, numbers, dots, underscores, or hyphens and start with a letter or number.";
  if (filePath) {
    throw new SkillSchemaError(message, filePath);
  }
  throw new Error(message);
}

export function updateSkillSource(
  text: string,
  input: { name: string; description: string; instructions: string; filePath: string },
): string {
  const normalized = text.replace(/^\uFEFF/, "");
  const match = normalized.match(FRONTMATTER_PATTERN);
  if (!match) throw new SkillSchemaError("Skill source requires frontmatter", input.filePath);
  const lines = (match[1] ?? "").split(/\r?\n/);
  replaceFrontmatterField(lines, "name", input.name);
  replaceFrontmatterField(lines, "description", JSON.stringify(input.description));
  return ["---", ...lines, "---", "", input.instructions.trim(), ""].join("\n");
}

function replaceFrontmatterField(lines: string[], field: string, value: string): void {
  const index = lines.findIndex((line) => {
    const separator = line.indexOf(":");
    return separator > 0 && line.slice(0, separator).trim().toLowerCase() === field;
  });
  if (index >= 0) {
    lines[index] = `${field}: ${value}`;
  } else {
    lines.push(`${field}: ${value}`);
  }
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

function parseDependencies(value: string | undefined): LoadedSkill["dependencies"] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((command) => ({ command }));
}
