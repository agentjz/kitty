import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { initializeProjectFiles } from "../../src/config/init.js";
import { KITTY_ENV } from "../../src/config/envKeys.js";
import { startLocalConsole } from "../../src/web/server.js";
import { renderKittyBanner } from "../../src/runtime-ui/banner.js";
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
  assert.equal((bootstrap.body.brand as { banner: string }).banner, renderKittyBanner());
  assert.equal((bootstrap.body.configuration as { file: string }).file, ".kitty/.env");

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
    runtime: { fields: Array<{ envKey: string; label: string }> };
  };
  assert.equal(messages.welcome, "Explore and enjoy!");
  assert.equal(messages.runtime.fields.find((field) => field.envKey === KITTY_ENV.locale)?.label, "Interface language");
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
