import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getAppPaths } from "../../src/config/paths.js";
import { SessionStore } from "../../src/session/store.js";
import { createTempWorkspace } from "../helpers.js";

test("session store persists and reloads session snapshots", async (t) => {
  const root = await createTempWorkspace("session-store", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  const session = await store.create(root);
  await store.save(session);

  const loaded = await store.load(session.id);
  assert.equal(loaded.id, session.id);
  assert.equal(loaded.cwd, root);

  const latest = await store.loadLatest();
  assert.equal(latest?.id, session.id);
});

test("session store projects model-written session memory into a readable asset", async (t) => {
  const root = await createTempWorkspace("session-memory-asset", t);
  const paths = getAppPaths(root);
  const store = new SessionStore(paths.sessionsDir);
  const session = await store.create(root);
  await store.save({
    ...session,
    sessionMemory: {
      version: 1,
      summary: [
        "## Current Focus",
        "None",
        "",
        "## User Constraints",
        "用户要求本 session 用 txt 纯文本回答。",
        "",
        "## Decisions",
        "None",
        "",
        "## Open Threads",
        "None",
        "",
        "## Verification Facts",
        "None",
        "",
        "## Reusable Lessons",
        "None",
      ].join("\n"),
      updatedAt: "2026-05-22T00:00:00.000Z",
    },
  });

  const asset = await fs.readFile(path.join(paths.sessionMemoryDir, `${session.id}.md`), "utf8");
  assert.match(asset, /^# Session Memory/);
  assert.match(asset, /Kind: session/);
  assert.match(asset, new RegExp(`Evidence: session:${session.id}`));
  assert.match(asset, new RegExp(`Scope: ${session.id}`));
  assert.match(asset, /Tags: same-session, continuity/);
  assert.match(asset, /## Current Focus/);
  assert.match(asset, /## User Constraints/);
  assert.match(asset, /txt 纯文本回答/);
});
