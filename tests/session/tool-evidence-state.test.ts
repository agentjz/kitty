import assert from "node:assert/strict";
import test from "node:test";

import { deriveTaskState } from "../../src/session/taskState.js";
import { deriveRecentToolBatchFromMessages } from "../../src/session/checkpoint/derivation.js";
import type { StoredMessage, ToolResultEnvelope } from "../../src/types.js";

test("session state derives file, completion, blocker, and checkpoint facts from tool evidence", () => {
  const changed = envelope({
    callId: "write-1",
    toolName: "write",
    status: "success",
    summary: "wrote src/app.ts",
    targetPath: "src/app.ts",
    facts: { changedPaths: ["src/app.ts"], bytes: 20 },
  });
  const failed = envelope({
    callId: "test-1",
    toolName: "bash",
    status: "error",
    summary: "tests failed",
    facts: { exitCode: 1 },
    error: { message: "ROOT_CAUSE_SENTINEL" },
  });
  const messages: StoredMessage[] = [
    { role: "user", content: "change it", createdAt: "2026-07-11T00:00:00.000Z" },
    toolMessage(changed, "2026-07-11T00:00:01.000Z"),
    toolMessage(failed, "2026-07-11T00:00:02.000Z"),
  ];

  const state = deriveTaskState(messages);
  const checkpoint = deriveRecentToolBatchFromMessages(messages, "2026-07-11T00:00:03.000Z");

  assert.deepEqual(state.activeFiles, ["src/app.ts"]);
  assert.equal(state.completedActions.some((action) => action.includes("write src/app.ts")), true);
  assert.deepEqual(state.blockers, ["bash: ROOT_CAUSE_SENTINEL"]);
  assert.deepEqual(checkpoint?.changedPaths, ["src/app.ts"]);
});

test("session state clears recovered failures and excludes command working directories from active files", () => {
  const failed = envelope({
    callId: "verify-failed",
    toolName: "bash",
    status: "error",
    summary: "verification failed",
    facts: { exitCode: 1 },
    error: { message: "expected READY but received BROKEN" },
  });
  const passed = envelope({
    callId: "verify-passed",
    toolName: "bash",
    status: "success",
    summary: "verification passed",
    facts: { exitCode: 0 },
  });
  const messages: StoredMessage[] = [
    { role: "user", content: "repair it", createdAt: "2026-07-11T00:00:00.000Z" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "inspect",
          type: "function",
          function: { name: "bash", arguments: JSON.stringify({ command: "node verify.cjs", cwd: "C:/workspace" }) },
        },
        {
          id: "verify-failed",
          type: "function",
          function: { name: "bash", arguments: JSON.stringify({ command: "node verify.cjs", cwd: "C:/workspace" }) },
        },
        {
          id: "verify-passed",
          type: "function",
          function: { name: "bash", arguments: JSON.stringify({ command: "node verify.cjs", cwd: "C:/workspace" }) },
        },
      ],
      createdAt: "2026-07-11T00:00:01.000Z",
    },
    toolMessage(failed, "2026-07-11T00:00:02.000Z"),
    toolMessage(passed, "2026-07-11T00:00:03.000Z"),
  ];

  const state = deriveTaskState(messages);

  assert.deepEqual(state.activeFiles, []);
  assert.deepEqual(state.blockers, []);
  assert.equal(state.completedActions.includes("bash command (exit 0)"), true);
});

test("session state prefers canonical evidence paths over completed call arguments", () => {
  const read = envelope({
    callId: "read-file",
    toolName: "read",
    status: "success",
    summary: "read status.txt",
    targetPath: "status.txt",
    facts: {},
  });
  const messages: StoredMessage[] = [
    { role: "user", content: "inspect it", createdAt: "2026-07-11T00:00:00.000Z" },
    {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "read-file",
        type: "function",
        function: { name: "read", arguments: JSON.stringify({ path: "C:/workspace/status.txt" }) },
      }],
      createdAt: "2026-07-11T00:00:01.000Z",
    },
    toolMessage(read, "2026-07-11T00:00:02.000Z"),
  ];

  assert.deepEqual(deriveTaskState(messages).activeFiles, ["status.txt"]);
});

function envelope(input: {
  callId: string;
  toolName: string;
  status: ToolResultEnvelope["status"];
  summary: string;
  targetPath?: string;
  facts: ToolResultEnvelope["facts"];
  error?: ToolResultEnvelope["error"];
}): ToolResultEnvelope {
  return {
    callId: input.callId,
    toolName: input.toolName,
    status: input.status,
    summary: input.summary,
    modelView: input.summary,
    compactView: input.summary,
    provenance: input.targetPath ? { targetPath: input.targetPath } : undefined,
    facts: input.facts,
    error: input.error,
    artifacts: [],
    truncation: { truncated: false, strategy: "none", projectedChars: input.summary.length },
  };
}

function toolMessage(toolResult: ToolResultEnvelope, createdAt: string): StoredMessage {
  return {
    role: "tool",
    name: toolResult.toolName,
    tool_call_id: toolResult.callId,
    content: toolResult.modelView,
    toolResult,
    createdAt,
  };
}
