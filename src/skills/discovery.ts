import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import type { LoadedSkill, ProjectIgnoreRule } from "../types.js";
import { isPathIgnored } from "../utils/ignore.js";
import { parseSkillSource } from "./schema.js";

const SKILL_RESOURCE_GLOBS = [
  "references/**",
  "reference/**",
  "scripts/**",
  "examples/**",
  "assets/**",
] as const;

const IGNORED_SKILL_RESOURCE_GLOBS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/SKILL.md",
] as const;

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
    skill.resources = await listSkillResources(skill.absolutePath, rootDir, ignoreRules);
    skill.health = buildSkillPackageHealth(skill);
    const existingPath = seenNames.get(skill.name);
    if (existingPath && existingPath !== skill.absolutePath) {
      throw new Error(`Duplicate skill name "${skill.name}" found in ${existingPath} and ${skill.absolutePath}.`);
    }
    seenNames.set(skill.name, skill.absolutePath);
    skills.push(skill);
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

async function listSkillResources(
  skillPath: string,
  rootDir: string,
  ignoreRules: ProjectIgnoreRule[],
): Promise<LoadedSkill["resources"]> {
  const skillDir = path.dirname(skillPath);
  const files = await fg([...SKILL_RESOURCE_GLOBS], {
    cwd: skillDir,
    absolute: true,
    dot: true,
    onlyFiles: true,
    suppressErrors: true,
    ignore: [...IGNORED_SKILL_RESOURCE_GLOBS],
  });
  const resources = [];
  for (const file of uniquePaths(files).sort((left, right) => left.localeCompare(right))) {
    if (isPathIgnored(file, ignoreRules)) {
      continue;
    }
    const stat = await fs.stat(file);
    resources.push({
      path: path.relative(rootDir, file),
      size: stat.size,
      kind: readSkillResourceKind(path.relative(skillDir, file)),
    });
  }
  return resources;
}

function readSkillResourceKind(relativePath: string): LoadedSkill["resources"][number]["kind"] {
  const firstSegment = relativePath.split(/[\\/]/)[0]?.toLowerCase();
  if (firstSegment === "references" || firstSegment === "reference") {
    return "references";
  }
  if (firstSegment === "scripts") {
    return "scripts";
  }
  if (firstSegment === "examples") {
    return "examples";
  }
  if (firstSegment === "assets") {
    return "assets";
  }
  return "other";
}

function buildSkillPackageHealth(skill: LoadedSkill): LoadedSkill["health"] {
  const resourceGroups = {
    references: 0,
    scripts: 0,
    examples: 0,
    assets: 0,
    other: 0,
  };
  for (const resource of skill.resources) {
    resourceGroups[resource.kind] += 1;
  }

  const bodyPresent = skill.body.trim().length > 0;
  const issues = [
    bodyPresent ? undefined : "SKILL.md body is empty",
  ].filter((item): item is string => Boolean(item));

  return {
    status: issues.length === 0 ? "ready" : "needs_content",
    bodyPresent,
    resourceCount: skill.resources.length,
    dependencyCount: skill.dependencies.length,
    resourceGroups,
    issues,
  };
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
