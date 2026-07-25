import assert from "node:assert/strict";
import test from "node:test";

import { buildProfilePersonaPromptBlocks, listAgentProfiles, resolveAgentProfile } from "../../src/agent/profiles/registry.js";

test("agent profile registry exposes the direct review profile", () => {
  const profile = resolveAgentProfile("sharp");
  assert.ok(profile.name.trim());
  assert.ok(profile.summary.trim());
  assert.ok(buildProfilePersonaPromptBlocks(profile).length > 0);
  assert.equal(listAgentProfiles().some((entry) => entry.id === "sharp"), true);
});
