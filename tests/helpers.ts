import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

import { ChangeStore } from "../src/agent/changes/store.js";
import { getAppPaths } from "../src/config/paths.js";
import { resolveTelegramRuntimeConfig, resolveWeixinRuntimeConfig } from "../src/config/hosts.js";
import { getInitialRuntimeConfig } from "../src/config/initialConfig.js";
import type { ToolContext } from "../src/tools/core/types.js";
import type { RuntimeConfig } from "../src/types.js";

export async function createTempWorkspace(
  prefix: string,
  t: TestContext,
  options: { gitBoundary?: "valid" | "unavailable" } = {},
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `Kitty-test-${prefix}-`));
  if (options.gitBoundary === "unavailable") {
    await fs.writeFile(path.join(dir, ".git"), "gitdir: unavailable\n", "utf8");
  } else {
    await createIsolatedGitBoundary(dir);
  }
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function createIsolatedGitBoundary(root: string): Promise<void> {
  const gitDir = path.join(root, ".git");
  await Promise.all([
    fs.mkdir(path.join(gitDir, "objects"), { recursive: true }),
    fs.mkdir(path.join(gitDir, "refs", "heads"), { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n", "utf8"),
    fs.writeFile(path.join(gitDir, "config"), [
      "[core]",
      "\trepositoryformatversion = 0",
      "\tfilemode = false",
      "\tbare = false",
      "\tlogallrefupdates = true",
      "",
    ].join("\n"), "utf8"),
  ]);
}

export async function initGitRepo(root: string): Promise<void> {
  const { execa } = await import("execa");
  await fs.writeFile(path.join(root, "README.md"), "# test\n", "utf8");
  for (const args of [
    ["init"],
    ["config", "user.email", "kitty@example.test"],
    ["config", "user.name", "Kitty Test"],
    ["add", "README.md"],
    ["commit", "-m", "initial"],
  ]) {
    const result = await execa("git", args, {
      cwd: root,
      all: true,
      reject: false,
      windowsHide: true,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.all ?? `git ${args.join(" ")} failed`);
    }
  }
}

export function createTestRuntimeConfig(root: string): RuntimeConfig {
  const initialConfig = getInitialRuntimeConfig();
  return {
    ...initialConfig,
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    thinking: "enabled",
    telegram: resolveTelegramRuntimeConfig(initialConfig.telegram, root),
    weixin: resolveWeixinRuntimeConfig(initialConfig.weixin, root),
    extensions: {
      ...initialConfig.extensions,
    },
    paths: getAppPaths(root),
  };
}

export function createToolContext(root: string): ToolContext {
  const config = createTestRuntimeConfig(root);
  return {
    config,
    cwd: root,
    sessionId: "test-session",
    ownerSessionId: "test-session",
    turnId: "test-turn",
    toolCallId: "test-tool-call",
    runtimeState: {},
    projectContext: {
      rootDir: root,
      stateRootDir: root,
      cwd: root,
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
      skills: [],
    },
    changeStore: new ChangeStore(config.paths.changesDir),
    createToolRegistry: () => ({
      definitions: [],
      execute: async () => ({ ok: false, output: "unimplemented" }),
    }),
  };
}

export const TEST_EXECUTION_OWNER = {
  ownerSessionId: "test-session",
  createdBySessionId: "test-session",
  parentTurnId: "test-turn",
  originToolCallId: "test-tool-call",
} as const;

export function parseToolJson(output: string): Record<string, unknown> {
  return JSON.parse(output) as Record<string, unknown>;
}
