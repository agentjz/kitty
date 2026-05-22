export interface SkillResourceSummary {
  path: string;
  size: number;
}

export interface LoadedSkill {
  name: string;
  description: string;
  path: string;
  absolutePath: string;
  body: string;
  resources: SkillResourceSummary[];
}

export type SkillSummary = Omit<LoadedSkill, "absolutePath" | "body">;
