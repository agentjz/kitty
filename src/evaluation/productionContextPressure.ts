import fs from "node:fs/promises";
import path from "node:path";

import { getAppPaths } from "../config/paths.js";
import { resolveRuntimeConfig } from "../config/store.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { runHostTurn } from "../host/turn.js";
import { SessionStore } from "../session/store.js";
import type { RuntimeConfig } from "../types.js";
import { passed } from "./types.js";
import type { EvaluationCheckResult, ProductionEvaluationCheckId } from "./types.js";
import { prepareCheckWorkspace } from "./workspace.js";

const PRESSURE_TURN_COUNT = 2;
const PRESSURE_PAYLOAD_REPETITIONS = 900;

export async function runProductionContextPressureCheck(
  id: ProductionEvaluationCheckId,
  rootDir: string,
): Promise<EvaluationCheckResult> {
  const sourceConfig = await resolveRuntimeConfig({ cwd: rootDir });
  if (!sourceConfig.apiKey.trim()) {
    return {
      id,
      status: "failed",
      fact: "production context pressure blocked: KITTY_API_KEY is missing",
    };
  }

  const workspace = await prepareCheckWorkspace(rootDir, "production-context-pressure");
  const pressure = await runLongConversationPressure(sourceConfig, workspace);
  if (pressure.status !== "passed") {
    return { id, status: "failed", fact: pressure.fact };
  }

  const overflow = await runIrreducibleOverflow(sourceConfig, path.join(workspace, "overflow"));
  if (overflow.status !== "passed") {
    return { id, status: "failed", fact: overflow.fact };
  }

  return passed(
    id,
    `production context pressure ready: turns=${pressure.turns}, epochs=${pressure.epochs}, compression=${pressure.compressionMode}, overflow=failed-locally`,
  );
}

async function runLongConversationPressure(
  sourceConfig: RuntimeConfig,
  workspace: string,
): Promise<{
  status: "passed" | "failed";
  fact: string;
  turns?: number;
  epochs?: number;
  compressionMode?: string;
}> {
  let config: RuntimeConfig = {
    ...sourceConfig,
    paths: getAppPaths(workspace),
    maxOutputTokens: Math.min(sourceConfig.maxOutputTokens, 192),
    contextWindowMessages: 120,
    maxContextChars: 80_000,
    contextSummaryChars: 3_000,
    reasoningEffort: "minimal",
  };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  let session = await sessionStore.save(await sessionStore.create(workspace));
  let compressionMode = "none";

  for (let turn = 1; turn <= PRESSURE_TURN_COUNT; turn += 1) {
    const marker = `KITTY_CONTEXT_TURN_${turn}`;
    const payload = turn === 1
      ? `${marker}_PAYLOAD `.repeat(PRESSURE_PAYLOAD_REPETITIONS)
      : "Use the compressed conversation and preserve the latest marker.";
    const outcome = await runHostTurn({
      host: "eval-production-context-pressure",
      input: `Remember ${marker}. Reply with only ACK ${marker}.\n${payload}`,
      cwd: workspace,
      stateRootDir: workspace,
      config,
      session,
      sessionStore,
      builtinToolFilter: () => false,
    }, emptyToolDependencies());
    if (outcome.status !== "completed") {
      return {
        status: "failed",
        fact: `production long conversation failed at turn=${turn}: status=${outcome.status}, error=${outcome.errorMessage ?? "none"}`,
      };
    }
    session = outcome.session;
    if (turn === 1) {
      const firstEstimate = session.contextBudget?.estimatedChars;
      if (!firstEstimate || firstEstimate <= 12_000) {
        return {
          status: "failed",
          fact: `production long conversation did not create measurable pressure: estimated=${firstEstimate ?? "none"}`,
        };
      }
      config = {
        ...config,
        contextWindowMessages: 1,
        maxContextChars: Math.max(8_000, firstEstimate - 12_000),
      };
    }
    if (session.contextBudget?.compressed) {
      compressionMode = session.contextBudget.compressionMode;
    }
  }

  const ledger = new ControlPlaneLedger(workspace);
  try {
    const turns = ledger.turns.listBySession(session.id);
    const epochs = ledger.contextEpochs.list(session.id);
    const reloaded = await sessionStore.load(session.id);
    const finalAssistant = reloaded.messages.filter((message) => message.role === "assistant").at(-1);
    const finalMarker = `KITTY_CONTEXT_TURN_${PRESSURE_TURN_COUNT}`;
    const complete = turns.length === PRESSURE_TURN_COUNT &&
      turns.every((turn) => turn.status === "completed") &&
      epochs.length > 0 &&
      compressionMode !== "none" &&
      finalAssistant?.content?.includes(finalMarker);
    if (!complete) {
      return {
        status: "failed",
        fact: `production long conversation incomplete: turns=${turns.length}, completed=${turns.filter((turn) => turn.status === "completed").length}, epochs=${epochs.length}, compression=${compressionMode}, finalMarker=${finalAssistant?.content?.includes(finalMarker) ?? false}`,
      };
    }
    return {
      status: "passed",
      fact: "production long conversation compressed and completed",
      turns: turns.length,
      epochs: epochs.length,
      compressionMode,
    };
  } finally {
    ledger.close();
  }
}

async function runIrreducibleOverflow(
  sourceConfig: RuntimeConfig,
  workspace: string,
): Promise<{ status: "passed" | "failed"; fact: string }> {
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(
    path.join(workspace, "AGENTS.md"),
    `# Oversized production instruction\n\n${"IRREDUCIBLE_CONTEXT ".repeat(6_000)}\n`,
    "utf8",
  );
  const config: RuntimeConfig = {
    ...sourceConfig,
    paths: getAppPaths(workspace),
    maxOutputTokens: Math.min(sourceConfig.maxOutputTokens, 128),
    maxContextChars: 12_000,
    contextSummaryChars: 1_000,
    projectDocMaxBytes: 160_000,
  };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(workspace));
  const outcome = await runHostTurn({
    host: "eval-production-context-overflow",
    input: "Confirm whether this turn can fit.",
    cwd: workspace,
    stateRootDir: workspace,
    config,
    session,
    sessionStore,
    builtinToolFilter: () => false,
  }, emptyToolDependencies());

  const ledger = new ControlPlaneLedger(workspace);
  try {
    const turns = ledger.turns.listBySession(session.id);
    const reloaded = await sessionStore.load(session.id);
    const assistants = reloaded.messages.filter((message) => message.role === "assistant");
    const failedLocally = outcome.status === "failed" &&
      outcome.errorMessage?.includes("Context cannot fit within the provider budget") &&
      turns.length === 1 &&
      turns[0]?.status === "failed" &&
      assistants.length === 0;
    return failedLocally
      ? { status: "passed", fact: "irreducible context failed before provider completion" }
      : {
          status: "failed",
          fact: `production context overflow boundary failed: outcome=${outcome.status}, error=${outcome.errorMessage ?? "none"}, turns=${turns.map((turn) => turn.status).join(",") || "none"}, assistants=${assistants.length}`,
        };
  } finally {
    ledger.close();
  }
}

function emptyToolDependencies() {
  return {
    createToolRegistry: async () => ({
      definitions: [],
      entries: [],
      execute: async () => ({ ok: false, output: "Production context eval disables tools." }),
      close: async () => undefined,
    }),
  };
}
