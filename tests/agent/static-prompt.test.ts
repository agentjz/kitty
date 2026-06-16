import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemPrompt } from "../../src/agent/systemPrompt.js";
import { INTP_PROFILE } from "../../src/agent/profiles/intp/index.js";
import { createTestRuntimeConfig } from "../helpers.js";

test("agent static prompt names the lead loop without hardcoding the tool surface", () => {
  const config = createTestRuntimeConfig(process.cwd());
  const text = buildSystemPrompt(
    process.cwd(),
    config,
    {
      rootDir: process.cwd(),
      stateRootDir: process.cwd(),
      cwd: process.cwd(),
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
      skills: [],
    },
    undefined,
    {
      identity: {
        kind: "lead",
        name: "lead",
      },
      taskSummary: "",
    },
  );

  assert.match(text, /lead agent/);
  assert.match(text, /active tool surface is supplied by the current runtime/);
  assert.match(text, /exposed tool definitions as the active capability boundary/);
  assert.match(text, /extra blocks define the active workflow/);
  assert.match(text, /Always reply in Simplified Chinese/);
  assert.match(text, /Make every sentence carry decision, execution, evidence, or understanding/);
  assert.match(text, /Use safe summaries or focused excerpts for large raw content/);
  assert.doesNotMatch(text, /read, edit, write, and bash/);
  assert.doesNotMatch(text, /active tool surface is read, edit, write, and bash/);
});

test("intp profile carries compressed communication policy", () => {
  const profileText = INTP_PROFILE.personaBlocks.map((block) => block.content).join("\n");

  assert.match(profileText, /short, exact, substance-first/);
  assert.match(profileText, /Keep detail only when it changes action or prevents ambiguity/);
});
