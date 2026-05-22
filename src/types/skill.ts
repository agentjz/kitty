export interface SkillResourceSummary {
  path: string;
  size: number;
}

export interface SkillDependencySummary {
  command: string;
}

export interface LoadedSkill {
  name: string;
  description: string;
  path: string;
  absolutePath: string;
  body: string;
  dependencies: SkillDependencySummary[];
  resources: SkillResourceSummary[];
}

export type SkillSummary = Omit<LoadedSkill, "absolutePath" | "body">;
