import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { formatRuntimeStatusText } from "../../src/cli/commands/runtimeStatusPresenter.js";
import { buildRuntimeStatus } from "../../src/runtime/status.js";
import { SessionStore } from "../../src/session/store.js";
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
      cacheLayout: {
        stablePrefixFingerprint: "stable123",
        volatileTailFingerprint: "tail456",
        stablePrefixChars: 30_000,
        volatileTailChars: 15_000,
        stableSources: ["staticPrompt", "profilePersona"],
        volatileSources: ["runtimeFacts", "nearFieldConversation"],
      },
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
  assert.equal(status.scene.headline, "One delegated task is running.");
  assert.equal(status.scene.nextAction, "Wait for the active task, or inspect it with `kitty status` / `kitty execution`.");
  assert.match(status.scene.cost, /5% context/);
  assert.match(status.scene.cost, /stable 67%/);
  assert.equal(status.scene.recovery, "One wake signal is recorded.");
  assert.equal(status.scene.skills.nextAction, "No runtime skills are discovered in this project.");
  assert.equal(status.scene.memory.latestSessionMemory, true);
  assert.equal(status.scene.memory.nextAction, "Session memory is available; use assets only when needed.");

  const text = formatRuntimeStatusText(status);
  assert.match(text, /Current scene:/);
  assert.match(text, /Now: One delegated task is running\./);
  assert.match(text, /Skills: 0\/0 ready; No runtime skills are discovered in this project\./);
  assert.match(text, /Memory: session memory ready; 1 reviewable memory file\(s\); Session memory is available; use assets only when needed\./);
  assert.match(text, /Cost: 5% context; stable 67%; No model request recorded yet/);
  assert.match(text, /Runtime facts:/);
  assert.match(text, /Focus: Investigate runtime/);
  assert.match(text, /Next: Wait for the active task, or inspect it with `kitty status` \/ `kitty execution`\./);
  assert.match(text, /Blocked: No blockers visible\./);
  assert.match(text, /Skills: 0\/0 ready/);
  assert.match(text, /Executions: 1 active \/ 1 total/);
  assert.match(text, /Context budget: 45000\/900000 chars/);
  assert.match(text, /Workset: 1 file\(s\)/);
  assert.match(text, /src\/runtime\/status\.ts  read=1  changed=1  last=edit/);
  assert.match(text, /Context budget hotspots:/);
  assert.match(text, /Context budget sources:/);
  assert.match(text, /nearFieldConversation  chars=25000  messages=3/);
  assert.match(text, /Cache layout:/);
  assert.match(text, /stable=stable123/);
  assert.match(text, /tail=tail456/);
  assert.match(text, /stableRatio=67%/);
  assert.match(text, /stableSources=staticPrompt,profilePersona/);
  assert.match(text, /Model cache: none/);
  assert.match(text, /Task facts:/);
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
          cacheMissTokens: 300,
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
  assert.match(status.scene.cost, /1250 tokens/);
  assert.match(status.scene.cost, /900 cached/);
  assert.match(status.scene.cost, /75% hit/);
  assert.match(text, /Model cache: cached=900/);
  assert.match(text, /miss=300/);
  assert.match(text, /Recent model requests:/);
  assert.match(text, /cacheRead=900/);
});

test("runtime status surfaces recent tool output governance facts", async (t) => {
  const root = await createTempWorkspace("runtime-status-tool-output", t);
  await initGitRepo(root);
  const paths = path.join(root, ".kitty", "observability", "events");
  await fs.mkdir(paths, { recursive: true });
  await fs.writeFile(
    path.join(paths, "2026-06-22.jsonl"),
    JSON.stringify({
      version: 1,
      timestamp: "2026-06-22T00:00:00.000Z",
      event: "tool.output",
      status: "completed",
      toolName: "bash",
      details: {
        kind: "test",
        mode: "structured",
        rawChars: 12000,
        projectedChars: 800,
        rawTokens: 3000,
        projectedTokens: 200,
        savedTokens: 2800,
        savingsRatio: 0.9333,
        truncated: true,
        outputPath: "observability/command-output/session/output.txt",
        degraded: false,
        reason: "structured_projection",
      },
    }) + "\n",
    "utf8",
  );

  const status = await buildRuntimeStatus(root);
  const text = formatRuntimeStatusText(status);

  assert.equal(status.toolOutputs.recent.length, 1);
  assert.match(status.scene.toolOutputs, /1 recent/);
  assert.match(status.scene.toolOutputs, /2800 tokens saved est\./);
  assert.match(status.scene.toolOutputs, /1 recoverable/);
  assert.match(text, /Tool output: 1 recent; 2800 tokens saved est\.; 1 recoverable; top=bash:test/);
  assert.match(text, /Recent tool output:/);
  assert.match(text, /bash  kind=test  mode=structured  raw=3000  projected=200  saved=2800/);
  assert.match(text, /savedRatio=93%/);
  assert.match(text, /recoverable=yes/);
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
  assert.equal(status.scene.background.active, 1);
  assert.equal(status.scene.background.blocked, 1);
  assert.match(status.scene.background.nextAction, /kitty background read/);
  assert.equal(status.scene.executions[0]?.risk, "watch");
  assert.match(formatRuntimeStatusText(status), /risk=watch/);
});

test("runtime status exposes corrupt sessions without hiding readable sessions", async (t) => {
  const root = await createTempWorkspace("runtime-status-corrupt-session", t);
  const paths = path.join(root, ".kitty", "sessions");
  const sessionStore = new SessionStore(paths);
  const session = await sessionStore.save(await sessionStore.create(root));
  await fs.writeFile(path.join(paths, "broken.json"), "{not json", "utf8");

  const status = await buildRuntimeStatus(root);
  const text = formatRuntimeStatusText(status);

  assert.equal(status.sessions.total, 1);
  assert.equal(status.sessions.latest?.id, session.id);
  assert.equal(status.sessions.skipped, 1);
  assert.match(text, /Sessions: 1 total, 1 skipped/);
});

test("runtime status marks stale background executions as blocked recovery work", async (t) => {
  const root = await createTempWorkspace("runtime-status-stale-background", t);
  const ledger = new ControlPlaneLedger(root);
  try {
    const execution = ledger.executions.create({
      kind: "background",
      status: "running",
      command: "long task",
      cwd: root,
      requestedBy: "lead",
    });
    ledger.executions.close(execution.id, {
      status: "stale",
      summary: "process disappeared",
    });
  } finally {
    ledger.close();
  }

  const status = await buildRuntimeStatus(root);
  const text = formatRuntimeStatusText(status);

  assert.equal(status.scene.headline, "One delegated task needs attention.");
  assert.equal(status.scene.background.active, 1);
  assert.equal(status.scene.background.blocked, 1);
  assert.equal(status.scene.executions[0]?.risk, "blocked");
  assert.match(status.scene.executions[0]?.nextAction ?? "", /kitty background stop/);
  assert.match(text, /risk=blocked/);
});

test("runtime scene gives a direct starting action when no session exists", async (t) => {
  const root = await createTempWorkspace("runtime-status-empty-scene", t);

  const status = await buildRuntimeStatus(root);

  assert.equal(status.scene.headline, "No session has started yet.");
  assert.equal(status.scene.nextAction, "Start a session with `kitty`.");
  assert.equal(status.scene.blocked, "No blockers visible.");
  assert.match(formatRuntimeStatusText(status), /Now: No session has started yet\./);
});
