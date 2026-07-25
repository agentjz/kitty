import fs from "node:fs/promises";
import path from "node:path";

import { discoverSkills } from "../skills/discovery.js";
import {
  SKILL_FILE_NAME,
  STANDARD_SKILLS_DIR_NAME,
  updateSkillSource,
  validateSkillName,
} from "../skills/schema.js";
import { atomicWriteFile } from "../utils/fs.js";

export class WebSkillService {
  constructor(private readonly cwd: string) {}

  async initialize(): Promise<string> {
    const skillRoot = path.join(this.cwd, STANDARD_SKILLS_DIR_NAME);
    await fs.mkdir(skillRoot, { recursive: true });
    await requireRealDirectory(skillRoot, "Skill workspace");
    return skillRoot;
  }

  async list() {
    return (await this.load()).map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: skill.path,
      resources: skill.resources,
      dependencies: skill.dependencies,
      health: skill.health,
    }));
  }

  async create(input: { name: string; description: string; instructions: string }) {
    const { name, description, instructions } = validateSkillInput(input);
    const skillRoot = await this.initialize();
    const skillDir = path.join(skillRoot, name);
    const skillPath = path.join(skillDir, SKILL_FILE_NAME);
    const source = [
      "---",
      `name: ${name}`,
      `description: ${JSON.stringify(description)}`,
      "---",
      "",
      "# Instructions",
      "",
      instructions,
      "",
    ].join("\n");
    let createdPackage = false;
    try {
      await fs.mkdir(skillDir);
      createdPackage = true;
      await Promise.all(["references", "scripts", "examples", "assets"].map((directory) => (
        fs.mkdir(path.join(skillDir, directory))
      )));
      await fs.writeFile(skillPath, source, { encoding: "utf8", flag: "wx", flush: true });
      await this.requireManagedSkill(name);
    } catch (error) {
      if (createdPackage) {
        await fs.rm(skillDir, { recursive: true, force: true }).catch(() => undefined);
      }
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`Skill already exists: ${name}.`);
      }
      throw error;
    }
    return (await this.list()).find((skill) => skill.name === name)!;
  }

  async read(name: string): Promise<string> {
    const skill = await this.requireManagedSkill(name);
    return fs.readFile(skill.absolutePath, "utf8");
  }

  async inspect(name: string) {
    const skill = await this.requireManagedSkill(name);
    return {
      source: await fs.readFile(skill.absolutePath, "utf8"),
      instructions: skill.body,
      skill: {
        name: skill.name,
        description: skill.description,
        path: skill.path,
        resources: skill.resources,
        dependencies: skill.dependencies,
        health: skill.health,
      },
    };
  }

  async update(name: string, input: { description: string; instructions: string }) {
    const normalized = validateSkillInput({ name, ...input });
    const skill = await this.requireManagedSkill(normalized.name);
    const source = await fs.readFile(skill.absolutePath, "utf8");
    await atomicWriteFile(skill.absolutePath, updateSkillSource(source, {
      ...normalized,
      filePath: skill.absolutePath,
    }));
    return (await this.list()).find((candidate) => candidate.name === normalized.name)!;
  }

  async delete(name: string): Promise<void> {
    const skill = await this.requireManagedSkill(name);
    await fs.rm(path.dirname(skill.absolutePath), { recursive: true, force: false });
  }

  load() {
    return discoverSkills(this.cwd, this.cwd, []);
  }

  private async requireSkill(name: string) {
    const normalized = validateSkillName(name);
    const skill = (await this.load()).find((candidate) => candidate.name === normalized);
    if (!skill) throw new Error(`Skill not found: ${normalized}.`);
    return skill;
  }

  private async requireManagedSkill(name: string) {
    const skill = await this.requireSkill(name);
    await this.assertManagedSkill(skill.absolutePath, skill.name);
    return skill;
  }

  private async assertManagedSkill(absolutePath: string, name: string): Promise<void> {
    const skillRoot = path.resolve(this.cwd, STANDARD_SKILLS_DIR_NAME);
    const expectedPath = path.resolve(absolutePath);
    const packageRoot = path.dirname(expectedPath);
    if (!isPathInside(skillRoot, expectedPath)
      || path.basename(packageRoot) !== name
      || path.basename(expectedPath) !== SKILL_FILE_NAME) {
      throw new Error(`Skill path escapes the standard workspace: ${name}.`);
    }
    const realSkillRoot = await requireRealDirectory(skillRoot, "Skill workspace");
    const realPackageRoot = await requireRealDirectory(packageRoot, `Skill package "${name}"`);
    const realSkillPath = await requireRealFile(expectedPath, `Skill package "${name}" source`);
    if (!isPathInside(realSkillRoot, realPackageRoot)
      || !pathsEqual(realSkillPath, path.join(realPackageRoot, SKILL_FILE_NAME))) {
      throw new Error(`Skill path escapes the standard workspace: ${name}.`);
    }
  }
}

function validateSkillInput(input: { name: string; description: string; instructions: string }) {
  const name = validateSkillName(input.name);
  const description = input.description.trim();
  const instructions = input.instructions.trim();
  if (!description || description.length > 240 || /[\r\n]/u.test(description)) {
    throw new Error("Skill description must be a single line between 1 and 240 characters.");
  }
  if (!instructions || instructions.length > 12_000) {
    throw new Error("Skill instructions must be between 1 and 12000 characters.");
  }
  return { name, description, instructions };
}

async function requireRealDirectory(directoryPath: string, label: string): Promise<string> {
  try {
    const stat = await fs.lstat(directoryPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`${label} must be a real directory.`);
    }
    return await fs.realpath(directoryPath);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`${label} is not available.`);
  }
}

async function requireRealFile(filePath: string, label: string): Promise<string> {
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`${label} must be a real file.`);
    }
    return await fs.realpath(filePath);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`${label} is not available.`);
  }
}

function pathsEqual(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isPathInside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target);
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
