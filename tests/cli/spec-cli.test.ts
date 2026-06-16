import assert from "node:assert/strict";
import test from "node:test";

import { buildCliProgram } from "../../src/cli/program.js";
import type { RuntimeConfig, SessionRecord } from "../../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("spec command uses the isolated spec one-shot path", async (t) => {
  const root = await createTempWorkspace("spec-cli-one-shot", t);
  const config = createTestRuntimeConfig(root);
  let oneShotPrompt = "";
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    runSpecOneShot: async (options: {
      prompt: string;
      cwd: string;
      config: RuntimeConfig;
      session: SessionRecord;
    }) => {
      oneShotPrompt = options.prompt;
      return {
        session: options.session,
        closeout: {
          sessionId: options.session.id,
          completed: true,
          terminalTransition: null,
        },
      };
    },
  });
  program.exitOverride();

  await program.parseAsync(["spec", "设计新功能"], { from: "user" });

  assert.equal(oneShotPrompt, "设计新功能");
});

test("spec command opens interactive spec mode without a prompt", async (t) => {
  const root = await createTempWorkspace("spec-cli-interactive", t);
  const config = createTestRuntimeConfig(root);
  let started = false;
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    startSpecInteractive: async () => {
      started = true;
    },
  });
  program.exitOverride();

  await program.parseAsync(["spec"], { from: "user" });

  assert.equal(started, true);
});

test("spec command can print workflow status without starting a turn", async (t) => {
  const root = await createTempWorkspace("spec-cli-status", t);
  const config = createTestRuntimeConfig(root);
  let started = false;
  let ranOneShot = false;
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      stateRootDir: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    startSpecInteractive: async () => {
      started = true;
    },
    runSpecOneShot: async (options) => {
      ranOneShot = true;
      return {
        session: options.session,
        closeout: {
          sessionId: options.session.id,
          completed: true,
          terminalTransition: null,
        },
      };
    },
  });
  program.exitOverride();

  await program.parseAsync(["spec", "--status"], { from: "user" });

  assert.equal(started, false);
  assert.equal(ranOneShot, false);
});
