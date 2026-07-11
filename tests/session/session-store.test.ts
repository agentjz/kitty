import assert from "node:assert/strict";
import test from "node:test";

import { getAppPaths } from "../../src/config/paths.js";
import { SessionRevisionConflictError } from "../../src/control/sessions.js";
import { createMessage } from "../../src/session/messages.js";
import { SessionStore } from "../../src/session/store.js";
import { createTempWorkspace } from "../helpers.js";

test("session store persists and reloads SQLite sessions", async (t) => {
  const root = await createTempWorkspace("session-store", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  const session = await store.save(await store.create(root));

  const loaded = await store.load(session.id);
  assert.equal(loaded.id, session.id);
  assert.equal(loaded.cwd, root);
  assert.equal(loaded.revision, 1);
  assert.equal((await store.loadLatest())?.id, session.id);
});

test("session store preserves context cache layout facts", async (t) => {
  const root = await createTempWorkspace("session-cache-layout", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  const session = await store.create(root);
  await store.save({
    ...session,
    contextBudget: {
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

test("session store rejects stale revisions and preserves append-only messages", async (t) => {
  const root = await createTempWorkspace("session-revision", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  const created = await store.save(await store.create(root));
  const firstReader = await store.load(created.id);
  const staleReader = await store.load(created.id);
  const saved = await store.appendMessages(firstReader, [createMessage("user", "first durable input")]);

  await assert.rejects(
    store.appendMessages(staleReader, [createMessage("user", "stale input")]),
    SessionRevisionConflictError,
  );

  const loaded = await store.load(created.id);
  assert.equal(loaded.revision, saved.revision);
  assert.deepEqual(loaded.messages.map((message) => message.content), ["first durable input"]);
});

test("session store lists SQLite-backed sessions", async (t) => {
  const root = await createTempWorkspace("session-list", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  const session = await store.save(await store.create(root));

  const readable = await store.listReadable(10);
  assert.equal(readable.sessions.length, 1);
  assert.equal(readable.sessions[0]?.id, session.id);
  assert.deepEqual(readable.skipped, []);
});
