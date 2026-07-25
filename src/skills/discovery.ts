import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import type { LoadedSkill, ProjectIgnoreRule } from "../types.js";
import { isPathIgnored } from "../utils/ignore.js";
import {
  parseSkillSource,
  SKILL_FILE_NAME,
  SkillSchemaError,
  STANDARD_SKILLS_DIR_NAME,
  validateSkillName,
} from "./schema.js";

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
  const skillFiles = await findSkillFiles(cwd);
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
    const packageName = path.basename(path.dirname(normalizedPath));
    validateSkillName(packageName, normalizedPath);
    if (skill.name !== packageName) {
      throw new SkillSchemaError(
        `Skill metadata field "name" must match its package directory "${packageName}".`,
        normalizedPath,
      );
    }
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
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: [...IGNORED_SKILL_RESOURCE_GLOBS],
  });
  const resources = [];
  const realSkillDir = await fs.realpath(skillDir);
  for (const file of uniquePaths(files).sort((left, right) => left.localeCompare(right))) {
    if (isPathIgnored(file, ignoreRules)) {
      continue;
    }
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      continue;
    }
    const realFile = await fs.realpath(file);
    if (!isPathInside(realSkillDir, realFile)) {
      continue;
    }
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

async function findSkillFiles(cwd: string): Promise<string[]> {
  const skillRoot = path.join(cwd, STANDARD_SKILLS_DIR_NAME);
  const realSkillRoot = await readRealDirectory(skillRoot);
  if (!realSkillRoot) {
    return [];
  }
  const candidates = await fg(`**/${SKILL_FILE_NAME}`, {
    cwd: skillRoot,
    absolute: true,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
  });
  const files: string[] = [];
  for (const skillFile of uniquePaths(candidates)) {
    const packageRoot = path.dirname(skillFile);
    const realPackageRoot = await readRealDirectory(packageRoot);
    if (!realPackageRoot || !isPathInside(realSkillRoot, realPackageRoot)) {
      continue;
    }
    if (await isRealFileAt(skillFile, path.join(realPackageRoot, SKILL_FILE_NAME))) {
      files.push(skillFile);
    }
  }

  return uniquePaths(files).sort((left, right) => left.localeCompare(right));
}

async function readRealDirectory(directoryPath: string): Promise<string | undefined> {
  try {
    const stat = await fs.lstat(directoryPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      return undefined;
    }
    return await fs.realpath(directoryPath);
  } catch {
    return undefined;
  }
}

async function isRealFileAt(filePath: string, expectedRealPath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return false;
    }
    return pathsEqual(await fs.realpath(filePath), expectedRealPath);
  } catch {
    return false;
  }
}

function isPathInside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function pathsEqual(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => path.normalize(item)))];
}
