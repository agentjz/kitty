import assert from "node:assert/strict";
import test from "node:test";

import { getAppPaths } from "../../src/config/paths.js";
import { resolveTelegramRuntimeConfig, resolveWeixinRuntimeConfig } from "../../src/config/hosts.js";
import { getInitialRuntimeConfig } from "../../src/config/initialConfig.js";
import type {
  RuntimeConfig,
  RuntimeTransition,
  SessionRecord,
  ToolExecutionResult,
} from "../../src/types.js";

test("public type barrel exposes runtime, session, transition, and tool result contracts", () => {
  const initialConfig = getInitialRuntimeConfig();
  const config = {
    ...initialConfig,
    provider: "agnes",
    apiKey: "test",
    media: { ...initialConfig.media, apiKey: "test" },
    capabilities: structuredClone(initialConfig.capabilities),
    baseUrl: "https://apihub.agnes-ai.com/v1",
    model: "agnes-2.0-flash",
    thinking: "enabled",
    telegram: resolveTelegramRuntimeConfig(initialConfig.telegram, "."),
    weixin: resolveWeixinRuntimeConfig(initialConfig.weixin, "."),
    paths: getAppPaths("."),
  } satisfies RuntimeConfig;

  const session = {
    id: "session-public-type",
    revision: 0,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    cwd: ".",
    messageCount: 0,
    messages: [],
  } satisfies SessionRecord;

  const transition = {
    action: "finalize",
    reason: {
      code: "finalize.completed",
      changedPaths: [],
    },
    timestamp: "2026-05-20T00:00:00.000Z",
  } satisfies RuntimeTransition;

  const result = {
    ok: true,
    output: "{}",
  } satisfies ToolExecutionResult;

  assert.equal(session.id, "session-public-type");
  assert.equal(config.model, "agnes-2.0-flash");
  assert.equal(transition.action, "finalize");
  assert.equal(result.ok, true);
});
