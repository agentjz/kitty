export interface LoadedSkill {
  name: string;
  description: string;
  path: string;
  absolutePath: string;
  body: string;
}

export type SkillSummary = Omit<LoadedSkill, "absolutePath" | "body">;
