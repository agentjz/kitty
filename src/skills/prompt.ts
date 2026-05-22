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
      value: "Skills are project knowledge packages. This context shows only the index. Call skill_load for the full method, and skill_read_resource for declared package resources.",
    },
    {
      label: "Index",
      value: formatLimitedList(skills.slice(0, MAX_VISIBLE_SKILLS).map(formatSkill), MAX_VISIBLE_SKILLS),
    },
    skills.length > MAX_VISIBLE_SKILLS
      ? {
          label: "Hidden",
          value: `${skills.length - MAX_VISIBLE_SKILLS} more skill(s) are hidden. Call skill_list for the full index.`,
        }
      : { label: "Hidden", value: undefined },
  ]);
}

function formatSkill(skill: LoadedSkill): string {
  const resources = skill.resources.length > 0 ? `; resources=${skill.resources.length}` : "";
  return `${skill.name}: ${skill.description} (${skill.path}${resources})`;
}
