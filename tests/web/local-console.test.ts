import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { initializeProjectFiles } from "../../src/config/init.js";
import { KITTY_ENV } from "../../src/config/envKeys.js";
import { getProviderPresetBaseUrl, PROVIDER_PRESETS } from "../../src/config/providerPresets.js";
import { resolveRuntimeConfig } from "../../src/config/runtime.js";
import { createMessage } from "../../src/session/messages.js";
import { SessionStore } from "../../src/session/store.js";
import { startLocalConsole } from "../../src/web/server.js";
import { renderKittyAgentWordmark } from "../../src/runtime-ui/banner.js";
import { WeixinSessionMapStore } from "../../src/weixin/state.js";
import packageJson from "../../package.json";
import { createTempWorkspace } from "../helpers.js";

test("local console binds loopback, authenticates API, and rejects foreign write origins", async (t) => {
  const root = await createTempWorkspace("web-security", t);
  await initializeProjectFiles(root);
  const handle = await startLocalConsole(root);
  t.after(() => handle.close());
  const url = new URL(handle.url);
  assert.equal(url.hostname, "127.0.0.1");

  const unauthorized = await fetch(new URL("/api/bootstrap", url));
  assert.equal(unauthorized.status, 401);
  const bootstrap = await request(handle, "/api/bootstrap");
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.body.locale, "zh-CN");
  assert.equal((bootstrap.body.messages as { welcome: string }).welcome, "尽情地探索并享受吧！");
  assert.deepEqual(bootstrap.body.brand, {
    version: packageJson.version,
    wordmark: renderKittyAgentWordmark(),
  });
  assert.equal((bootstrap.body.configuration as { file: string }).file, ".kitty/.env");
  const webPage = await fetch(handle.webUrl);
  assert.equal(webPage.status, 200);
  const webSource = await webPage.text();
  assert.match(webSource, /marked\.esm\.js/u);
  assert.match(webSource, /presentation/u);
  assert.equal(webSource.includes("message.payload"), false);

  const foreign = await fetch(new URL("/api/config", url), {
    method: "PUT",
    headers: { authorization: `Bearer ${handle.token}`, "content-type": "application/json", origin: "https://example.test" },
    body: JSON.stringify({ values: { [KITTY_ENV.showReasoning]: "false" } }),
  });
  assert.equal(foreign.status, 403);
});

test("local console preserves visible secrets and reads current skills", async (t) => {
  const root = await createTempWorkspace("web-crud", t);
  await initializeProjectFiles(root);
  const skillSource = "---\nname: web-skill\ndescription: Read from Web.\n---\n\n# Instructions\n";
  await fs.mkdir(path.join(root, ".skills", "web-skill"), { recursive: true });
  await fs.writeFile(path.join(root, ".skills", "web-skill", "SKILL.md"), skillSource, "utf8");
  const handle = await startLocalConsole(root);
  t.after(() => handle.close());

  const saved = await request(handle, "/api/config", {
    method: "PUT",
    body: JSON.stringify({ values: { [KITTY_ENV.showReasoning]: "false", [KITTY_ENV.apiKey]: "visible-secret" } }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal((saved.body.values as Record<string, string>)[KITTY_ENV.showReasoning], "false");
  assert.equal((saved.body.values as Record<string, string>)[KITTY_ENV.apiKey], "visible-secret");

  const preserved = await request(handle, "/api/config", {
    method: "PUT",
    body: JSON.stringify({ values: { [KITTY_ENV.apiKey]: "" } }),
  });
  assert.equal((preserved.body.values as Record<string, string>)[KITTY_ENV.apiKey], "visible-secret");

  const loadedSkill = await request(handle, "/api/skills/web-skill");
  assert.equal(loadedSkill.body.source, skillSource);

  await request(handle, "/api/config", {
    method: "PUT",
    body: JSON.stringify({ values: { [KITTY_ENV.locale]: "en" } }),
  });
  const localized = await request(handle, "/api/bootstrap");
  assert.equal(localized.body.locale, "en");
  const messages = localized.body.messages as {
    welcome: string;
    runtime: { otherFields: Array<{ envKey: string; label: string }> };
  };
  assert.equal(messages.welcome, "Explore and enjoy!");
  assert.equal(messages.runtime.otherFields.find((field) => field.envKey === KITTY_ENV.locale)?.label, "Interface language");
});

test("local console rehydrates durable Weixin channel history", async (t) => {
  const root = await createTempWorkspace("web-channel-history", t);
  await initializeProjectFiles(root);
  const config = await resolveRuntimeConfig({ cwd: root });
  const sessions = new SessionStore(config.paths.sessionsDir);
  const session = await sessions.save(await sessions.create(root));
  await sessions.appendMessages(session, [
    createMessage("user", "之前的微信消息", { source: "external" }),
    createMessage("assistant", "之前的最终回复", { reasoningContent: "之前的思考" }),
  ]);
  await new WeixinSessionMapStore(config.weixin.sessionMapFile).set({
    peerKey: "weixin:private:owner",
    userId: "owner",
    sessionId: session.id,
    cwd: root,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const handle = await startLocalConsole(root);
  t.after(() => handle.close());
  const history = await request(handle, "/api/channels/weixin/history");
  assert.equal(history.response.status, 200);
  const items = history.body.items as Array<{ kind: string; text: string; sessionId: string; peerKey: string; createdAt: string }>;
  assert.deepEqual(items.map(({ kind, text }) => ({ kind, text })), [
    { kind: "inbound", text: "之前的微信消息" },
    { kind: "reasoning", text: "之前的思考" },
    { kind: "final", text: "之前的最终回复" },
  ]);
  assert.equal(items.every((item) => item.sessionId === session.id && item.peerKey === "weixin:private:owner" && item.createdAt), true);
});

test("local console switches providers through the single runtime API key", async (t) => {
  const root = await createTempWorkspace("web-provider-keys", t);
  await initializeProjectFiles(root);
  const handle = await startLocalConsole(root);
  t.after(() => handle.close());
  const deepseekPreset = PROVIDER_PRESETS.find((preset) => preset.provider === "deepseek")!;
  const saved = await request(handle, "/api/config", {
    method: "PUT",
    body: JSON.stringify({ values: {
      [KITTY_ENV.provider]: "deepseek",
      [KITTY_ENV.baseUrl]: getProviderPresetBaseUrl(deepseekPreset),
      [KITTY_ENV.model]: deepseekPreset.model,
      [KITTY_ENV.thinking]: deepseekPreset.thinking,
      [KITTY_ENV.reasoningEffort]: deepseekPreset.reasoningEffort,
      [KITTY_ENV.apiKey]: "deep-active-key",
    } }),
  });
  assert.equal(saved.response.status, 200);
  const loaded = await request(handle, "/api/bootstrap");
  const values = loaded.body.configuration as { values: Record<string, string> };
  assert.equal(values.values[KITTY_ENV.apiKey], "deep-active-key");
  assert.equal((await resolveRuntimeConfig({ cwd: root })).apiKey, "deep-active-key");

  const agnesPreset = PROVIDER_PRESETS.find((preset) => preset.provider === "agnes")!;
  const switched = await request(handle, "/api/config", {
    method: "PUT",
    body: JSON.stringify({ values: {
      [KITTY_ENV.provider]: agnesPreset.provider,
      [KITTY_ENV.baseUrl]: getProviderPresetBaseUrl(agnesPreset),
      [KITTY_ENV.model]: agnesPreset.model,
      [KITTY_ENV.thinking]: agnesPreset.thinking,
      [KITTY_ENV.reasoningEffort]: agnesPreset.reasoningEffort,
      [KITTY_ENV.apiKey]: "agnes-active-key",
    } }),
  });
  assert.equal(switched.response.status, 200);
  const switchedValues = switched.body.values as Record<string, string>;
  assert.equal(switchedValues[KITTY_ENV.provider], "agnes");
  assert.equal(switchedValues[KITTY_ENV.model], "agnes-2.0-flash");
  assert.equal(switchedValues[KITTY_ENV.baseUrl], "https://apihub.agnes-ai.com/v1");
  assert.equal(switchedValues[KITTY_ENV.apiKey], "agnes-active-key");
  const runtime = await resolveRuntimeConfig({ cwd: root });
  assert.equal(runtime.provider, "agnes");
  assert.equal(runtime.model, "agnes-2.0-flash");
  assert.equal(runtime.baseUrl, "https://apihub.agnes-ai.com/v1");
  assert.equal(runtime.apiKey, "agnes-active-key");
});

async function request(handle: Awaited<ReturnType<typeof startLocalConsole>>, pathname: string, init: RequestInit = {}) {
  const base = new URL(handle.url);
  const response = await fetch(new URL(pathname, base), {
    ...init,
    headers: {
      authorization: `Bearer ${handle.token}`,
      origin: base.origin,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return { response, body: await response.json() as Record<string, unknown> };
}
