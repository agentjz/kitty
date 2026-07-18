import assert from "node:assert/strict";
import test from "node:test";

import { buildProfilePersonaPromptBlocks, listAgentProfiles, resolveAgentProfile } from "../../src/agent/profiles/registry.js";

test("agent profile registry exposes the direct review profile", () => {
  const profile = resolveAgentProfile("sharp");
  assert.equal(profile.name, "毒舌");
  assert.match(profile.summary, /需求分析/);
  assert.equal(buildProfilePersonaPromptBlocks(profile).some((block) => block.includes("Attack the reasoning")), true);
  assert.equal(listAgentProfiles().some((entry) => entry.id === "sharp"), true);
});
