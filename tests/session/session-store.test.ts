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

test("session store preserves context cache layout facts", async (t) => {
  const root = await createTempWorkspace("session-cache-layout", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  const session = await store.create(root);
  await store.save({
    ...session,
    contextBudget: {
      version: 1,
      limitChars: 900_000,
      estimatedChars: 12_000,
      remainingChars: 888_000,
      usageRatio: 0.0133,
      compressed: false,
      compressionMode: "none",
      compressionReason: "within_budget",
      sources: [
        { name: "systemPrompt", chars: 8_000 },
        { name: "nearFieldConversation", chars: 4_000, messages: 2 },
      ],
      promptHotspots: [
        { layer: "static", title: "Project Instructions", chars: 4_000, lines: 80 },
      ],
      cacheLayout: {
        stablePrefixFingerprint: "aaaaaaaa",
        volatileTailFingerprint: "bbbbbbbb",
        stablePrefixChars: 6_000,
        volatileTailChars: 2_000,
        stableSources: ["staticPrompt", "profilePersona"],
        volatileSources: ["runtimeFacts", "nearFieldConversation"],
      },
    },
  });

  const loaded = await store.load(session.id);

  assert.deepEqual(loaded.contextBudget?.cacheLayout, {
    stablePrefixFingerprint: "aaaaaaaa",
    volatileTailFingerprint: "bbbbbbbb",
    stablePrefixChars: 6_000,
    volatileTailChars: 2_000,
    stableSources: ["staticPrompt", "profilePersona"],
    volatileSources: ["runtimeFacts", "nearFieldConversation"],
  });
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

test("session store lists readable sessions while exposing corrupt snapshots", async (t) => {
  const root = await createTempWorkspace("session-corrupt-list", t);
  const paths = getAppPaths(root);
  const store = new SessionStore(paths.sessionsDir);
  const session = await store.save(await store.create(root));
  await fs.mkdir(paths.sessionsDir, { recursive: true });
  await fs.writeFile(path.join(paths.sessionsDir, "broken.json"), "{not json", "utf8");

  const readable = await store.listReadable(10);

  assert.equal(readable.sessions.length, 1);
  assert.equal(readable.sessions[0]?.id, session.id);
  assert.equal(readable.skipped.length, 1);
  assert.equal(readable.skipped[0]?.code, "SESSION_CORRUPT");
  assert.match(readable.skipped[0]?.path ?? "", /broken\.json$/);
});
