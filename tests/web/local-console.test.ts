import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { initializeProjectFiles } from "../../src/config/init.js";
import { KITTY_ENV } from "../../src/config/envKeys.js";
import { getProviderPresetBaseUrl, PROVIDER_PRESETS } from "../../src/config/providerPresets.js";
import { resolveRuntimeConfig } from "../../src/config/runtime.js";
import { createMessage } from "../../src/session/messages.js";
import { SessionStore } from "../../src/session/store.js";
import { startLocalConsole } from "../../src/web/server.js";
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
  });
  assert.equal((bootstrap.body.configuration as { file: string }).file, ".kitty/.env");
  const providers = bootstrap.body.providers as Array<{ id: string; label: string; model: string }>;
  assert.deepEqual(
    providers.filter(({ id }) => id.startsWith("agnes-") || id.startsWith("glm-")).map(({ id }) => id),
    [
      "agnes-2.0-flash",
      "agnes-2.5-flash",
      "glm-4.7-flash",
      "glm-4.6",
      "glm-4.7",
      "glm-5",
      "glm-5-turbo",
      "glm-5.1",
      "glm-5.2",
    ],
  );
  assert.equal(providers.every(({ label }) => label.includes("｜") || label.startsWith("DeepSeek")), true);
  const webPage = await fetch(handle.webUrl);
  assert.equal(webPage.status, 200);
  const webSource = await webPage.text();
  assert.match(webSource, /marked\.esm\.js/u);
  assert.match(webSource, /presentation/u);
  assert.equal(webSource.includes("message.payload"), false);
  const consolePage = await fetch(handle.url);
  const consoleSource = await consolePage.text();
  assert.match(consoleSource, /<h1 class="kitty-hero-title">Kitty Agent<\/h1>/u);
  assert.match(consoleSource, /id="author-note"/u);
  assert.match(consoleSource, /data-action="close-author-note"/u);

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

test("local console projects and saves independent media configuration", async (t) => {
  const root = await createTempWorkspace("web-media-config", t);
  await initializeProjectFiles(root);
  const handle = await startLocalConsole(root);
  t.after(() => handle.close());
  const bootstrap = await request(handle, "/api/bootstrap");
  const mediaProviders = bootstrap.body.mediaProviders as Array<{ id: string; imageModel: string; videoModel: string }>;
  assert.deepEqual(mediaProviders.map(({ id, imageModel, videoModel }) => ({ id, imageModel, videoModel })), [{
    id: "agnes",
    imageModel: "agnes-image-2.1-flash",
    videoModel: "agnes-video-v2.0",
  }]);

  const saved = await request(handle, "/api/config", {
    method: "PUT",
    body: JSON.stringify({ values: {
      [KITTY_ENV.mediaProvider]: "agnes",
      [KITTY_ENV.mediaBaseUrl]: "https://apihub.agnes-ai.com/v1",
      [KITTY_ENV.mediaApiKey]: "media-secret",
      [KITTY_ENV.mediaImageModel]: "agnes-image-2.1-flash",
      [KITTY_ENV.mediaVideoModel]: "agnes-video-v2.0",
      [KITTY_ENV.mediaRequestTimeoutMs]: "600000",
      [KITTY_ENV.mediaPollIntervalMs]: "15000",
    } }),
  });
  assert.equal((saved.body.values as Record<string, string>)[KITTY_ENV.mediaApiKey], "media-secret");
  const runtime = await resolveRuntimeConfig({ cwd: root });
  assert.equal(runtime.media.apiKey, "media-secret");
  assert.equal(runtime.media.imageModel, "agnes-image-2.1-flash");

  const page = await fetch(handle.url);
  const html = await page.text();
  assert.match(html, /data-workflow-panel="media"/u);
  assert.match(html, /id="media-form"/u);
});

test("local console lets humans generate and retrieve image and video artifacts", async (t) => {
  const root = await createTempWorkspace("web-media-generation", t);
  await initializeProjectFiles(root);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const mp4 = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]);
  const providerCalls: string[] = [];
  const provider = http.createServer((request, response) => {
    providerCalls.push(`${request.method} ${request.url}`);
    if (request.method === "POST" && request.url === "/v1/images/generations") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }));
      return;
    }
    if (request.method === "POST" && request.url === "/v1/videos") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ video_id: "video_web", status: "queued", progress: 0 }));
      return;
    }
    if (request.method === "GET" && request.url === "/agnesapi?video_id=video_web") {
      const address = provider.address();
      const port = typeof address === "object" && address ? address.port : 0;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "video_web", status: "completed", url: `http://127.0.0.1:${port}/video.mp4` }));
      return;
    }
    if (request.method === "GET" && request.url === "/video.mp4") {
      response.writeHead(200, { "content-type": "video/mp4" });
      response.end(mp4);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => provider.close(() => resolve())));
  const address = provider.address();
  assert.equal(typeof address, "object");
  const mediaBaseUrl = `http://127.0.0.1:${(address as { port: number }).port}/v1`;

  const handle = await startLocalConsole(root);
  t.after(() => handle.close());
  await request(handle, "/api/config", {
    method: "PUT",
    body: JSON.stringify({ values: {
      [KITTY_ENV.mediaBaseUrl]: mediaBaseUrl,
      [KITTY_ENV.mediaApiKey]: "media-web-secret",
      [KITTY_ENV.mediaPollIntervalMs]: "5000",
    } }),
  });

  const foreignMedia = await fetch(new URL("/api/media/images", new URL(handle.url)), {
    method: "POST",
    headers: {
      authorization: `Bearer ${handle.token}`,
      "content-type": "application/json",
      origin: "https://example.test",
    },
    body: JSON.stringify({ prompt: "a foreign-origin request" }),
  });
  assert.equal(foreignMedia.status, 403);
  const unauthenticatedArtifact = await fetch(new URL("/api/media/artifacts?path=generated/kitty/missing.png", new URL(handle.url)));
  assert.equal(unauthenticatedArtifact.status, 401);

  const image = await request(handle, "/api/media/images", {
    method: "POST",
    body: JSON.stringify({ prompt: "a bright paper kite", size: "1K", ratio: "1:1" }),
  });
  assert.equal(image.response.status, 200);
  assert.equal(image.body.status, "completed");
  assert.match(String(image.body.path), /^generated\/kitty\/.+\.png$/u);
  const imageArtifact = await requestArtifact(handle, String(image.body.path));
  assert.equal(imageArtifact.response.headers.get("content-type"), "image/png");
  assert.deepEqual(imageArtifact.bytes, png);

  const created = await request(handle, "/api/media/videos", {
    method: "POST",
    body: JSON.stringify({ prompt: "a paper kite crossing the sky", width: 1152, height: 768, numFrames: 81, frameRate: 24 }),
  });
  assert.equal(created.response.status, 202);
  assert.equal(created.body.videoId, "video_web");
  const taskFile = path.join(root, ".kitty", "extensions", "media", "video-tasks", "video_web.json");
  const task = JSON.parse(await fs.readFile(taskFile, "utf8")) as Record<string, unknown>;
  task.nextPollAt = new Date(0).toISOString();
  await fs.writeFile(taskFile, `${JSON.stringify(task)}\n`, "utf8");

  const completed = await request(handle, "/api/media/videos/video_web/poll", { method: "POST", body: "{}" });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.status, "completed");
  assert.match(String(completed.body.path), /^generated\/kitty\/.+\.mp4$/u);
  const videoArtifact = await requestArtifact(handle, String(completed.body.path));
  assert.equal(videoArtifact.response.headers.get("content-type"), "video/mp4");
  assert.deepEqual(videoArtifact.bytes, mp4);
  assert.equal(providerCalls.filter((call) => call === "POST /v1/images/generations").length, 1);
  assert.equal(providerCalls.filter((call) => call === "POST /v1/videos").length, 1);

  const traversal = await request(handle, "/api/media/artifacts?path=..%2F.kitty%2F.env");
  assert.equal(traversal.response.status, 422);
  const page = await fetch(handle.url);
  const html = await page.text();
  const mediaPanelStart = html.indexOf('data-workflow-panel="media"');
  const nextPanelStart = html.indexOf('data-workflow-panel="plugins"', mediaPanelStart);
  const imagePrompt = html.indexOf('id="media-image-prompt"');
  const videoPrompt = html.indexOf('id="media-video-prompt"');
  assert.equal(mediaPanelStart >= 0 && nextPanelStart > mediaPanelStart, true);
  assert.equal(imagePrompt > mediaPanelStart && imagePrompt < nextPanelStart, true);
  assert.equal(videoPrompt > mediaPanelStart && videoPrompt < nextPanelStart, true);
  assert.match(html, /id="media-image-prompt"/u);
  assert.match(html, /id="media-video-prompt"/u);
  assert.match(html, /id="media-image-preview"/u);
  assert.match(html, /id="media-video-preview"/u);
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

async function requestArtifact(handle: Awaited<ReturnType<typeof startLocalConsole>>, artifactPath: string) {
  const base = new URL(handle.url);
  const url = new URL("/api/media/artifacts", base);
  url.searchParams.set("path", artifactPath);
  const response = await fetch(url, { headers: { authorization: `Bearer ${handle.token}` } });
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}
