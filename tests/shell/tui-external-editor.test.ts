import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import { editTextExternally } from "../../src/shell/tui/externalEditor.js";
import { SqliteTuiDraftStore } from "../../src/shell/tui/draftPersistence.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createTempWorkspace } from "../helpers.js";

test("tui external editor reads edited text and removes its temporary file", async () => {
  let temporaryFile = "";
  const edited = await editTextExternally("before", {
    command: "test-editor",
    async run(command, filePath) {
      assert.equal(command, "test-editor");
      temporaryFile = filePath;
      assert.equal(await readFile(filePath, "utf8"), "before");
      await writeFile(filePath, "after\r\n", "utf8");
    },
  });

  assert.equal(edited, "after");
  await assert.rejects(access(temporaryFile));
});

test("tui external editor removes temporary files after failure", async () => {
  let temporaryFile = "";
  await assert.rejects(editTextExternally("before", {
    async run(_command, filePath) {
      temporaryFile = filePath;
      throw new Error("editor failed");
    },
  }), /editor failed/);
  await assert.rejects(access(temporaryFile));
});

test("tui draft persistence writes immediately and clears submitted drafts", async (t) => {
  const root = await createTempWorkspace("tui-draft-persistence", t);
  const writer = new SqliteTuiDraftStore(root);
  writer.save("session-1", { cursor: 4, value: "work" });

  const reader = new ControlPlaneLedger(root);
  assert.deepEqual(reader.interactionDrafts.load("session-1", "tui"), {
    sessionId: "session-1",
    shell: "tui",
    cursor: 4,
    value: "work",
    updatedAt: reader.interactionDrafts.load("session-1", "tui")?.updatedAt,
  });
  reader.close();
  writer.dispose();

  const clearer = new SqliteTuiDraftStore(root);
  clearer.clear("session-1");
  clearer.dispose();
  const afterClear = new ControlPlaneLedger(root);
  assert.equal(afterClear.interactionDrafts.load("session-1", "tui"), undefined);
  afterClear.close();
});
