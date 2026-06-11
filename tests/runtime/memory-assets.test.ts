import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  appendRuntimeMemoryAssetToSkillReference,
  appendRuntimeMemoryAssetToSpecNotes,
  createRuntimeMemoryAsset,
  deleteRuntimeMemoryAsset,
  listRuntimeMemoryAssets,
  readRuntimeMemoryAsset,
  searchRuntimeMemoryAssets,
} from "../../src/runtime/memory/index.js";
import { SessionStore } from "../../src/session/store.js";
import { SpecStore } from "../../src/spec/store.js";
import { createTempWorkspace, initGitRepo } from "../helpers.js";

test("runtime memory assets can be listed, read, and searched", async (t) => {
  const root = await createTempWorkspace("runtime-memory-assets", t);
  const sessionStore = new SessionStore(`${root}/.kitty/sessions`);
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    sessionMemory: {
      version: 1,
      summary: [
        "## Current Focus",
        "Review runtime memory assets.",
        "",
        "## User Constraints",
        "None",
        "",
        "## Decisions",
        "None",
        "",
        "## Open Threads",
        "None",
        "",
        "## Verification Facts",
        "Runtime memory should be searchable and reusable.",
        "",
        "## Reusable Lessons",
        "None",
      ].join("\n"),
      updatedAt: "2026-05-22T00:00:00.000Z",
    },
  });

  const assets = await listRuntimeMemoryAssets(root);
  assert.equal(assets.length, 1);
  assert.equal(assets[0]?.id, session.id);
  assert.equal(assets[0]?.title, "Session Memory");
  assert.equal(assets[0]?.scope, session.id);
  assert.deepEqual(assets[0]?.tags, ["same-session", "continuity"]);

  const read = await readRuntimeMemoryAsset(root, session.id);
  assert.match(read.content, /Runtime memory should be searchable/);
  assert.equal(read.kind, "session");
  assert.deepEqual(read.evidenceRefs, [`session:${session.id}`]);
  assert.match(read.content, /Kind: session/);
  assert.match(read.content, /Scope:/);

  const search = await searchRuntimeMemoryAssets(root, "reusable");
  assert.equal(search.length, 1);
  assert.equal(search[0]?.id, session.id);
  assert.ok((search[0]?.score ?? 0) >= 1);
  assert.match(search[0]?.matches.join("\n") ?? "", /reusable/);

  const splitPhraseSearch = await searchRuntimeMemoryAssets(root, "Runtime reusable");
  assert.equal(splitPhraseSearch.length, 1);
  assert.equal(splitPhraseSearch[0]?.id, session.id);

  const deleted = await deleteRuntimeMemoryAsset(root, session.id);
  assert.equal(deleted.id, session.id);
  assert.equal((await listRuntimeMemoryAssets(root)).length, 0);
  assert.equal((await sessionStore.load(session.id)).sessionMemory, undefined);
});

test("runtime memory assets can be created with metadata and evidence refs", async (t) => {
  const root = await createTempWorkspace("runtime-memory-create", t);

  const created = await createRuntimeMemoryAsset({
    rootDir: root,
    kind: "project",
    title: "Memory architecture",
    content: "Keep lower evidence intact and put high-level summaries in reviewable assets.",
    evidenceRefs: ["session:abc", "execution:def"],
    scope: "kitty",
    tags: ["memory", "architecture"],
    timestamp: "2026-06-11T00:00:00.000Z",
  });

  assert.equal(created.id, "project/Memory-architecture");
  assert.equal(created.kind, "project");
  assert.equal(created.title, "Memory architecture");
  assert.equal(created.updatedAt, "2026-06-11T00:00:00.000Z");
  assert.equal(created.scope, "kitty");
  assert.deepEqual(created.tags, ["memory", "architecture"]);
  assert.deepEqual(created.evidenceRefs, ["session:abc", "execution:def"]);

  const read = await readRuntimeMemoryAsset(root, created.id);
  assert.match(read.content, /Kind: project/);
  assert.match(read.content, /Evidence: session:abc, execution:def/);
  assert.match(read.content, /Scope: kitty/);
  assert.match(read.content, /Tags: memory, architecture/);

  const byTags = await searchRuntimeMemoryAssets(root, "architecture session:abc");
  assert.equal(byTags.length, 1);
  assert.equal(byTags[0]?.id, created.id);
  assert.ok((byTags[0]?.score ?? 0) >= 2);

  await assert.rejects(
    () => createRuntimeMemoryAsset({
      rootDir: root,
      kind: "project",
      title: "Memory architecture",
      content: "This should not overwrite the existing asset.",
    }),
    /EEXIST/,
  );
});

test("runtime memory assets expose asset kinds and evidence references", async (t) => {
  const root = await createTempWorkspace("runtime-memory-kinds", t);
  const sessionStore = new SessionStore(`${root}/.kitty/sessions`);
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    sessionMemory: {
      version: 1,
      summary: [
        "## Current Focus",
        "Keep memory assets traceable.",
        "",
        "## User Constraints",
        "None",
        "",
        "## Decisions",
        "None",
        "",
        "## Open Threads",
        "None",
        "",
        "## Verification Facts",
        "Session memory is backed by the session snapshot.",
        "",
        "## Reusable Lessons",
        "None",
      ].join("\n"),
      updatedAt: "2026-05-22T00:00:00.000Z",
    },
  });
  await writeFile(root, ".kitty/memory/project/repo.md", [
    "# Project Experience",
    "",
    "Evidence: session:manual-project-note",
    "",
    "Keep project map concise.",
  ].join("\n"));
  await writeFile(root, ".kitty/memory/user/preferences.md", [
    "# User Profile",
    "",
    "Evidence: session:manual-user-note",
    "",
    "User prefers concise answers.",
  ].join("\n"));

  const assets = await listRuntimeMemoryAssets(root);

  assert.deepEqual(assets.map((asset) => asset.kind).sort(), ["project", "session", "user"]);
  assert.equal(assets.find((asset) => asset.id === session.id)?.evidenceRefs[0], `session:${session.id}`);
  assert.equal(assets.find((asset) => asset.kind === "project")?.id, "project/repo");
  assert.equal(assets.find((asset) => asset.kind === "user")?.id, "user/preferences");
});

test("runtime memory assets can be appended to spec notes as evidence", async (t) => {
  const root = await createTempWorkspace("runtime-memory-to-spec", t);
  await initGitRepo(root);
  const sessionStore = new SessionStore(`${root}/.kitty/sessions`);
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    sessionMemory: {
      version: 1,
      summary: [
        "## Current Focus",
        "None",
        "",
        "## User Constraints",
        "None",
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
        "Reusable lesson: keep runtime state visible.",
      ].join("\n"),
      updatedAt: "2026-05-22T00:00:00.000Z",
    },
  });
  const specStore = new SpecStore(root, { rootDir: root });
  const spec = await specStore.create({
    title: "Memory Evidence",
    sessionId: session.id,
  });

  const appended = await appendRuntimeMemoryAssetToSpecNotes({
    rootDir: root,
    memoryId: session.id,
    specId: spec.id,
  });
  const notes = await specStore.readDocument(spec.id, "notes");

  assert.equal(appended.specId, spec.id);
  assert.match(notes, /Source memory asset:/);
  assert.match(notes, /Reusable lesson/);
});

test("runtime memory assets can be appended to runtime skill references", async (t) => {
  const root = await createTempWorkspace("runtime-memory-to-skill", t);
  await writeFile(root, "skills/review/SKILL.md", [
    "---",
    "name: review",
    "description: Review reusable lessons.",
    "---",
    "",
    "Use project lessons when relevant.",
  ].join("\n"));
  const sessionStore = new SessionStore(`${root}/.kitty/sessions`);
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    sessionMemory: {
      version: 1,
      summary: [
        "## Current Focus",
        "None",
        "",
        "## User Constraints",
        "None",
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
        "Reusable lesson: expose runtime facts instead of guessing.",
      ].join("\n"),
      updatedAt: "2026-05-22T00:00:00.000Z",
    },
  });

  const appended = await appendRuntimeMemoryAssetToSkillReference({
    rootDir: root,
    memoryId: session.id,
    skillName: "review",
  });
  const content = await fs.readFile(`${root}/${appended.path}`, "utf8");

  assert.equal(appended.skill.name, "review");
  assert.match(appended.path, /skills[\\/]review[\\/]references[\\/]/);
  assert.match(content, /Source memory asset:/);
  assert.match(content, /expose runtime facts/);
});

async function writeFile(root: string, relativePath: string, body: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body, "utf8");
}
