import { buildFieldBlock, formatLimitedList } from "../agent/prompt/structured.js";
import type { LoadedSkill } from "../types.js";

const MAX_VISIBLE_SKILLS = 12;

export function buildSkillIndexPromptBlock(skills: readonly LoadedSkill[]): string | undefined {
  if (skills.length === 0) {
    return undefined;
  }

  return buildFieldBlock("Available skills", [
    {
      label: "Policy",
      value: "Skills 是项目知识包。当前只给索引；需要完整方法时由模型自己调用 skill_load。",
    },
    {
      label: "Index",
      value: formatLimitedList(skills.slice(0, MAX_VISIBLE_SKILLS).map(formatSkill), MAX_VISIBLE_SKILLS),
    },
    skills.length > MAX_VISIBLE_SKILLS
      ? {
          label: "Hidden",
          value: `还有 ${skills.length - MAX_VISIBLE_SKILLS} 个 skill。用 skill_list 查看完整索引。`,
        }
      : { label: "Hidden", value: undefined },
  ]);
}

function formatSkill(skill: LoadedSkill): string {
  return `${skill.name}: ${skill.description} (${skill.path})`;
}
