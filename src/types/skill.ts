export interface SkillResourceSummary {
  path: string;
  size: number;
  kind: "references" | "scripts" | "examples" | "assets" | "other";
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
  health: SkillPackageHealth;
}

export type SkillSummary = Omit<LoadedSkill, "absolutePath" | "body">;

export interface SkillPackageHealth {
  status: "ready" | "needs_content";
  bodyPresent: boolean;
  resourceCount: number;
  dependencyCount: number;
  resourceGroups: {
    references: number;
    scripts: number;
    examples: number;
    assets: number;
    other: number;
  };
  issues: string[];
}
