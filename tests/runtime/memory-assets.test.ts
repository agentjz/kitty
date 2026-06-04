import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  appendRuntimeMemoryAssetToSkillReference,
  appendRuntimeMemoryAssetToSpecNotes,
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
        "## Current Objective",
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
  assert.equal(assets[0]?.sessionId, session.id);

  const read = await readRuntimeMemoryAsset(root, session.id);
  assert.match(read.content, /Runtime memory should be searchable/);

  const search = await searchRuntimeMemoryAssets(root, "reusable");
  assert.equal(search.length, 1);
  assert.equal(search[0]?.sessionId, session.id);
  assert.match(search[0]?.matches.join("\n") ?? "", /reusable/);

  const splitPhraseSearch = await searchRuntimeMemoryAssets(root, "Runtime reusable");
  assert.equal(splitPhraseSearch.length, 0);

  const deleted = await deleteRuntimeMemoryAsset(root, session.id);
  assert.equal(deleted.sessionId, session.id);
  assert.equal((await listRuntimeMemoryAssets(root)).length, 0);
  assert.equal((await sessionStore.load(session.id)).sessionMemory, undefined);
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
        "## Current Objective",
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
    sessionId: session.id,
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
        "## Current Objective",
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
    sessionId: session.id,
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
