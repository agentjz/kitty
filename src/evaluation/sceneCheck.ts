import fs from "node:fs/promises";
import path from "node:path";

import { ControlPlaneLedger } from "../control/ledger.js";
import { formatRuntimeStatusText } from "../cli/commands/runtimeStatusPresenter.js";
import { buildRuntimeStatus } from "../runtime/status.js";
import { SessionStore } from "../session/store.js";
import { appendObservabilityEvent } from "../observability/writer.js";
import { passed, type EvaluationCheckId, type EvaluationCheckResult } from "./types.js";
import { prepareCheckWorkspace } from "./workspace.js";

export async function runProductionSceneCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
  const workspace = await prepareCheckWorkspace(rootDir, "production-scene");

  await fs.mkdir(path.join(workspace, "skills", "scene-skill"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, "skills", "scene-skill", "SKILL.md"),
    [
      "---",
      "name: scene-skill",
      "description: Checks production scene readiness.",
      "requires: node",
      "---",
      "Use when validating production runtime scene.",
    ].join("\n"),
    "utf8",
  );

  const sessionStore = new SessionStore(path.join(workspace, ".kitty", "sessions"));
  const session = await sessionStore.save({
    ...(await sessionStore.create(workspace)),
    title: "Production scene check",
    contextBudget: {
      limitChars: 100_000,
      estimatedChars: 50_000,
      remainingChars: 50_000,
      usageRatio: 0.5,
      compressed: false,
      compressionMode: "none",
      compressionReason: "within_budget",
      sources: [{ name: "nearFieldConversation", chars: 20_000, messages: 4 }],
      promptHotspots: [],
      cacheLayout: {
        stablePrefixFingerprint: "scene-stable",
        volatileTailFingerprint: "scene-tail",
        stablePrefixChars: 30_000,
        volatileTailChars: 20_000,
        stableSources: ["staticPrompt"],
        volatileSources: ["runtimeFacts", "nearFieldConversation"],
      },
    },
  });

  await appendObservabilityEvent(workspace, {
      event: "model.request",
      status: "completed",
      model: "gpt-5.5",
      durationMs: 123,
      details: {
        provider: "openai",
        usageAvailable: true,
        usage: {
          totalTokens: 1000,
          cacheReadTokens: 700,
          cacheMissTokens: 300,
          cacheHitRate: 0.7,
        },
      },
  });

  const ledger = new ControlPlaneLedger(workspace);
  try {
    ledger.executions.create({
      kind: "background",
      status: "running",
      command: "long production task",
      cwd: workspace,
      requestedBy: "lead",
      pid: process.pid,
      sessionId: session.id,
    });
  } finally {
    ledger.close();
  }

  const status = await buildRuntimeStatus(workspace);
  const text = formatRuntimeStatusText(status);

  if (
    status.scene.background.active !== 1 ||
    status.scene.background.blocked !== 1 ||
    !status.scene.cost.includes("1000 tokens") ||
    !status.scene.cost.includes("700 cached") ||
    status.scene.skills.ready < 1 ||
    status.skills.ready < 1 ||
    !text.includes("Current scene:") ||
    !text.includes("Background:") ||
    !text.includes("Cost:")
  ) {
    return {
      id,
      status: "failed",
      fact: `production scene incomplete: background=${status.scene.background.active}/${status.scene.background.blocked}, skills=${status.skills.ready}/${status.skills.total}, cost=${status.scene.cost}`,
    };
  }

  return passed(
    id,
    `production scene ready: background=${status.scene.background.active}/${status.scene.background.blocked}, skills=${status.skills.ready}/${status.skills.total}, cost=${status.scene.cost}`,
  );
}
