import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { formatRuntimeStatusText } from "../../src/cli/commands/runtimeStatusPresenter.js";
import { buildRuntimeStatus } from "../../src/runtime/status.js";
import { SessionStore } from "../../src/session/store.js";
import { SpecStore } from "../../src/spec/store.js";
import { createTempWorkspace, initGitRepo } from "../helpers.js";

test("runtime status projects the current project runtime facts", async (t) => {
  const root = await createTempWorkspace("runtime-status", t);
  await initGitRepo(root);
  const sessionStore = new SessionStore(`${root}/.kitty/sessions`);
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    title: "Investigate runtime",
    sessionMemory: {
      version: 1,
      summary: "User wants durable runtime visibility.",
      updatedAt: "2026-05-22T00:00:00.000Z",
    },
    contextBudget: {
      version: 1,
      limitChars: 900_000,
      estimatedChars: 45_000,
      remainingChars: 855_000,
      usageRatio: 0.05,
      compressed: false,
      compressionMode: "none",
      compressionReason: "within_budget",
      sources: [
        { name: "systemPrompt", chars: 20_000 },
        { name: "nearFieldConversation", chars: 25_000, messages: 3 },
      ],
      promptHotspots: [{
        layer: "runtimeFacts",
        title: "Project context",
        chars: 10_000,
        lines: 120,
      }],
    },
    workset: {
      version: 1,
      updatedAt: "2026-05-22T00:00:00.000Z",
      files: [{
        path: "src/runtime/status.ts",
        firstSeenAt: "2026-05-22T00:00:00.000Z",
        lastSeenAt: "2026-05-22T00:00:00.000Z",
        readCount: 1,
        changedCount: 1,
        lastTool: "edit",
        lastChangeId: "change-1",
        reason: "edited",
      }],
    },
  });

  const spec = await new SpecStore(root, { rootDir: root }).create({
    title: "Runtime Status",
    sessionId: session.id,
  });

  const ledger = new ControlPlaneLedger(root);
  try {
    ledger.taskLifecycle.startTurn({
      sessionId: session.id,
      reason: "turn_started",
    });
    const execution = ledger.executions.create({
      kind: "subagent",
      status: "running",
      prompt: "Inspect runtime state.",
      assignment: {
        objective: "Inspect runtime visibility",
        boundary: "Read-only runtime facts",
        expectedOutput: "Concise summary",
      },
      cwd: root,
      requestedBy: "lead",
      actorName: "alpha",
      actorRole: "explorer",
      sessionId: session.id,
    });
    ledger.wakeSignals.publish({
      executionId: execution.id,
      reason: "completed",
    });
  } finally {
    ledger.close();
  }

  const status = await buildRuntimeStatus(root);

  assert.equal(status.rootDir, root);
  assert.equal(status.sessions.total, 1);
  assert.equal(status.sessions.latest?.id, session.id);
  assert.equal(status.memory.assets.length, 1);
  assert.equal(status.memory.assets[0]?.id, session.id);
  assert.equal(status.skills.total, 0);
  assert.equal(status.taskLifecycle?.stage, "normal_work");
  assert.equal(status.sessions.latest?.focus, undefined);
  assert.equal(status.sessions.latest?.contextBudget?.compressionReason, "within_budget");
  assert.equal(status.sessions.latest?.workset?.files[0]?.path, "src/runtime/status.ts");
  assert.equal(status.executions.total, 1);
  assert.equal(status.executions.active.length, 1);
  assert.equal(status.executions.active[0]?.assignment?.objective, "Inspect runtime visibility");
  assert.equal(status.executions.active[0]?.health?.state, "running");
  assert.equal(status.wakeSignals.recent.length, 1);
  assert.equal(status.specs.total, 1);
  assert.equal(status.specs.active[0]?.id, spec.id);

  const text = formatRuntimeStatusText(status);
  assert.match(text, /Current workspace:/);
  assert.match(text, /Focus: none/);
  assert.match(text, /Next: Finish requirements\.md/);
  assert.match(text, /Blocked: requirements confirmation, design confirmation, tasks confirmation/);
  assert.match(text, /Skills: 0\/0 ready/);
  assert.match(text, /Executions: 1 active \/ 1 total/);
  assert.match(text, /Context budget: 45000\/900000 chars/);
  assert.match(text, /Workset: 1 file\(s\)/);
  assert.match(text, /src\/runtime\/status\.ts  read=1  changed=1  last=edit/);
  assert.match(text, /Context budget hotspots:/);
  assert.match(text, /Context budget sources:/);
  assert.match(text, /nearFieldConversation  chars=25000  messages=3/);
  assert.match(text, /Model cache: none/);
  assert.match(text, /Task lifecycle:/);
  assert.match(text, /Spec workspace:/);
  assert.match(text, /next: Finish requirements\.md/);
  assert.match(text, /documents: 0\/4 documents ready/);
});

test("runtime status surfaces recent model request cache facts", async (t) => {
  const root = await createTempWorkspace("runtime-status-cache", t);
  await initGitRepo(root);
  const paths = path.join(root, ".kitty", "observability", "events");
  await fs.mkdir(paths, { recursive: true });
  await fs.writeFile(
    path.join(paths, "2026-06-16.jsonl"),
    JSON.stringify({
      version: 1,
      timestamp: "2026-06-16T00:00:00.000Z",
      event: "model.request",
      status: "completed",
      model: "gpt-5.5",
      durationMs: 123,
      details: {
        provider: "openai",
        usage: {
          inputTokens: 1200,
          outputTokens: 50,
          totalTokens: 1250,
          cacheReadTokens: 900,
          cacheHitRate: 0.75,
        },
        usageAvailable: true,
      },
    }) + "\n",
    "utf8",
  );

  const status = await buildRuntimeStatus(root);
  const text = formatRuntimeStatusText(status);

  assert.equal(status.modelRequests.recent.length, 1);
  assert.match(text, /Model cache: cached=900/);
  assert.match(text, /Recent model requests:/);
  assert.match(text, /cacheRead=900/);
});

test("runtime status exposes background executions that are running without output", async (t) => {
  const root = await createTempWorkspace("runtime-status-background-health", t);
  const ledger = new ControlPlaneLedger(root);
  try {
    ledger.executions.create({
      kind: "background",
      status: "running",
      command: "long task",
      cwd: root,
      requestedBy: "lead",
      pid: process.pid,
    });
  } finally {
    ledger.close();
  }

  const status = await buildRuntimeStatus(root);

  assert.equal(status.executions.active.length, 1);
  assert.equal(status.executions.active[0]?.health?.state, "no_output");
  assert.match(status.executions.active[0]?.health?.message ?? "", /has not published output/);
});
