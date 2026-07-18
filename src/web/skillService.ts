import fs from "node:fs/promises";
import path from "node:path";

import { discoverSkills } from "../skills/discovery.js";

export class WebSkillService {
  constructor(private readonly cwd: string) {}

  async list(): Promise<Array<{ name: string; description: string; health: string }>> {
    return (await this.discover()).map((skill) => ({
      name: skill.name,
      description: skill.description,
      health: skill.health.status,
    }));
  }

  async read(name: string): Promise<string> {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(name)) throw new Error("Skill name contains unsupported characters.");
    const skill = (await this.discover()).find((candidate) => candidate.name === name);
    if (!skill) throw new Error(`Skill not found: ${name}.`);
    const relative = path.relative(this.cwd, skill.absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Skill path escapes the current project.");
    return fs.readFile(skill.absolutePath, "utf8");
  }

  private discover() {
    return discoverSkills(this.cwd, this.cwd, []);
  }
}
