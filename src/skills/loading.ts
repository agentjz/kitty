import type { LoadedSkill, SkillSummary } from "../types.js";

export function buildSkillSummary(skill: LoadedSkill): SkillSummary {
  const {
    absolutePath: _absolutePath,
    body: _body,
    ...summary
  } = skill;
  return summary;
}

export function buildLoadedSkillPayload(skill: LoadedSkill): {
  ok: true;
  skill: SkillSummary;
  body: string;
} {
  return {
    ok: true,
    skill: buildSkillSummary(skill),
    body: skill.body,
  };
}
