import assert from "node:assert/strict";
import test from "node:test";

import {
  projectToolCallPresentation,
  projectToolResultPresentation,
} from "../../src/runtime-ui/toolPresentation.js";

test("shared tool call presentation exposes only stable target facts", () => {
  assert.deepEqual(
    projectToolCallPresentation("edit", JSON.stringify({ path: "src/app.ts", edits: [{ oldText: "secret" }] })),
    { kind: "change", name: "edit", target: "src/app.ts", operationCount: 1 },
  );
  assert.deepEqual(
    projectToolCallPresentation("bash", JSON.stringify({ command: "echo secret" })),
    { kind: "command", name: "bash", command: "echo secret", cwd: undefined },
  );
  assert.deepEqual(
    projectToolCallPresentation("document_write", JSON.stringify({ path: "report.docx", content: "SECRET_BODY" })),
    { kind: "change", name: "document_write", target: "report.docx", operationCount: undefined },
  );
});

test("shared document presentation exposes ranges without replaying source content", () => {
  const read = projectToolResultPresentation("document_read", JSON.stringify({
    path: "manual.pdf",
    unit: "page",
    startUnit: 4,
    endUnit: 6,
    content: "document evidence",
    truncated: true,
  }));
  assert.deepEqual(read, {
    kind: "read",
    name: "document_read",
    path: "manual.pdf",
    startLine: undefined,
    endLine: undefined,
    startUnit: 4,
    endUnit: 6,
    unit: "page",
    content: "document evidence",
    truncated: true,
  });

  const write = projectToolResultPresentation("document_write", JSON.stringify({
    path: "report.docx",
    existed: false,
    bytes: 4096,
  }));
  assert.deepEqual(write, {
    kind: "document-change",
    name: "document_write",
    action: "created",
    path: "report.docx",
    bytes: 4096,
  });
});

test("shared tool result presentation preserves every diff hunk and its counts", () => {
  const presentation = projectToolResultPresentation("edit", JSON.stringify({
    path: "src/app.ts",
    diff: "@@ -1,2 +1,2 @@\n-old\n+new\n context\n@@ -20 +20 @@\n-before\n+after",
  }));

  assert.equal(presentation.kind, "change");
  if (presentation.kind !== "change") return;
  assert.equal(presentation.path, "src/app.ts");
  assert.equal(presentation.addedLines, 2);
  assert.equal(presentation.removedLines, 2);
  assert.equal(presentation.diffLines.filter((line) => line.startsWith("@@")).length, 2);
});

test("shared tool result presentation keeps structured plan and source evidence", () => {
  const plan = projectToolResultPresentation("todo_write", JSON.stringify({
    items: [
      { id: "1", text: "inspect facts", status: "completed" },
      { id: "2", text: "implement projection", status: "in_progress" },
    ],
  }));
  assert.equal(plan.kind, "plan");
  if (plan.kind === "plan") {
    assert.equal(plan.completed, 1);
    assert.deepEqual(plan.items.map((item) => item.status), ["completed", "in_progress"]);
  }

  const read = projectToolResultPresentation("read", JSON.stringify({
    path: "src/app.ts",
    startLine: 10,
    endLine: 12,
    content: "10 | a\n11 | b\n12 | c",
    truncated: true,
  }));
  assert.equal(read.kind, "read");
  if (read.kind === "read") {
    assert.equal(read.content, "10 | a\n11 | b\n12 | c");
    assert.equal(read.truncated, true);
  }
});

test("shared tool result presentation keeps a bounded generic error fact", () => {
  const presentation = projectToolResultPresentation("generate_image", JSON.stringify({
    ok: false,
    error: "Media provider is temporarily unavailable (HTTP 503, request req_test).",
  }));
  assert.deepEqual(presentation, {
    kind: "error",
    name: "generate_image",
    message: "Media provider is temporarily unavailable (HTTP 503, request req_test).",
  });
});
