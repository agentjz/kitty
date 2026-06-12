import assert from "node:assert/strict";
import test from "node:test";

import { createSessionRecord } from "../../src/session/store.js";
import { recordSessionWorksetFile } from "../../src/session/workset.js";

test("session workset records read and change facts for files", async () => {
  let session = await createSessionRecord("C:/repo");

  session = recordSessionWorksetFile(session, {
    cwd: "C:/repo",
    path: "C:/repo/src/app.ts",
    toolName: "read",
    changed: false,
    reason: "read",
    timestamp: "2026-06-12T00:00:00.000Z",
  });
  session = recordSessionWorksetFile(session, {
    cwd: "C:/repo",
    path: "C:/repo/src/app.ts",
    toolName: "edit",
    changed: true,
    changeId: "change-1",
    reason: "edited",
    timestamp: "2026-06-12T00:01:00.000Z",
  });

  assert.equal(session.workset?.files.length, 1);
  assert.equal(session.workset.files[0]?.path, "src\\app.ts");
  assert.equal(session.workset.files[0]?.readCount, 1);
  assert.equal(session.workset.files[0]?.changedCount, 1);
  assert.equal(session.workset.files[0]?.lastTool, "edit");
  assert.equal(session.workset.files[0]?.lastChangeId, "change-1");
});
