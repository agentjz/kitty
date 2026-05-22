import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import type { LoadedSkill, ProjectIgnoreRule } from "../types.js";
import { isPathIgnored } from "../utils/ignore.js";
import { parseSkillSource } from "./schema.js";

export async function discoverSkills(
  rootDir: string,
  cwd: string,
  ignoreRules: ProjectIgnoreRule[],
): Promise<LoadedSkill[]> {
  const skillFiles = await findSkillFiles(rootDir, cwd);
  const seenPaths = new Set<string>();
  const seenNames = new Map<string, string>();
  const skills: LoadedSkill[] = [];

  for (const skillFile of skillFiles) {
    const normalizedPath = path.normalize(skillFile);
    if (seenPaths.has(normalizedPath) || isPathIgnored(normalizedPath, ignoreRules)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    const skill = parseSkillSource(await fs.readFile(normalizedPath, "utf8"), {
      absolutePath: normalizedPath,
      rootDir,
    });
    const existingPath = seenNames.get(skill.name);
    if (existingPath && existingPath !== skill.absolutePath) {
      throw new Error(`Duplicate skill name "${skill.name}" found in ${existingPath} and ${skill.absolutePath}.`);
    }
    seenNames.set(skill.name, skill.absolutePath);
    skills.push(skill);
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

async function findSkillFiles(rootDir: string, cwd: string): Promise<string[]> {
  const candidates = uniquePaths([
    path.join(rootDir, "SKILL.md"),
    path.join(cwd, "SKILL.md"),
  ]);
  const roots = uniquePaths([
    path.join(rootDir, ".skills"),
    path.join(rootDir, "skills"),
    path.join(cwd, ".skills"),
    path.join(cwd, "skills"),
  ]);

  const files: string[] = [];
  for (const candidate of candidates) {
    if (await isRegularFile(candidate)) {
      files.push(candidate);
    }
  }

  for (const root of roots) {
    if (!(await isDirectory(root))) {
      continue;
    }
    files.push(...await fg("**/SKILL.md", {
      cwd: root,
      absolute: true,
      dot: true,
      onlyFiles: true,
      suppressErrors: true,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    }));
  }

  return uniquePaths(files).sort((left, right) => left.localeCompare(right));
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => path.normalize(item)))];
}
