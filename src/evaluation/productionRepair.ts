import fs from "node:fs/promises";
import path from "node:path";

import { resolveRuntimeConfig } from "../config/store.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { runHostTurn } from "../host/turn.js";
import { SessionEventStore } from "../session/events.js";
import { SessionStore } from "../session/store.js";
import { passed, type EvaluationCheckResult, type ProductionEvaluationCheckId } from "./types.js";

export async function runProductionRepairCheck(
  id: ProductionEvaluationCheckId,
  rootDir: string,
): Promise<EvaluationCheckResult> {
  const sourceConfig = await resolveRuntimeConfig({ cwd: rootDir });
  if (!sourceConfig.apiKey.trim()) {
    return { id, status: "failed", fact: "production repair blocked: KITTY_API_KEY is missing" };
  }

  const workspace = path.join(rootDir, ".kitty", "eval-production", "tool-turn");
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  await prepareDefect(workspace);
  process.env.KITTY_PRODUCTION_EXPECTED = "READY";

  const config = {
    ...sourceConfig,
    paths: {
      ...sourceConfig.paths,
      dataDir: path.join(workspace, ".kitty"),
      sessionsDir: path.join(workspace, ".kitty", "sessions"),
      changesDir: path.join(workspace, ".kitty", "changes"),
      eventsDir: path.join(workspace, ".kitty", "events"),
    },
    maxOutputTokens: Math.min(sourceConfig.maxOutputTokens, 768),
    contextWindowMessages: Math.min(sourceConfig.contextWindowMessages, 20),
    maxContextChars: Math.min(sourceConfig.maxContextChars, 80_000),
    contextSummaryChars: Math.min(sourceConfig.contextSummaryChars, 8_000),
  };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(workspace));
  const outcome = await runHostTurn({
    host: "eval-production",
    input: [
      "Fix this workspace production defect end to end.",
      "Before modifying any file, you MUST run `node verify.cjs` while status.txt is still broken.",
      "That first run must fail and expose EVIDENCE_ROOT_CAUSE in its tool result; reading the source is not a substitute.",
      "Use that observed failure evidence to repair status.txt,",
      "then rerun `node verify.cjs` until it passes.",
      "Finish with one short plain English sentence containing PRODUCTION_REPAIR_SENTINEL.",
      "Do not stop after explaining the failure.",
    ].join(" "),
    cwd: workspace,
    stateRootDir: workspace,
    config,
    session,
    sessionStore,
  });
  if (outcome.status !== "completed") {
    return {
      id,
      status: "failed",
      fact: `production repair failed: status=${outcome.status}, message=${outcome.errorMessage ?? "none"}`,
    };
  }

  const reloaded = await sessionStore.load(outcome.session.id);
  const events = await new SessionEventStore(config.paths.eventsDir).list(outcome.session.id, 60);
  const assistantToolCalls = reloaded.messages.filter((message) => message.role === "assistant" && message.tool_calls?.length);
  const assistantReasoningReplay = assistantToolCalls.filter((message) => message.reasoningContent);
  const toolMessages = reloaded.messages.filter((message) => message.role === "tool");
  const finalAssistant = [...reloaded.messages].reverse().find((message) => message.role === "assistant" && message.content?.trim());
  const eventTypes = events.map((event) => event.type);
  const repairedValue = (await fs.readFile(path.join(workspace, "status.txt"), "utf8")).trim();
  const bashResults = toolMessages.filter((message) => message.name === "bash");
  const failedVerification = bashResults.some((message) =>
    message.toolResult?.status === "error" && message.toolResult.modelView.includes("EVIDENCE_ROOT_CAUSE"));
  const passedVerification = bashResults.some((message) =>
    message.toolResult?.status === "success" && message.toolResult.modelView.includes("PRODUCTION_REPAIR_SENTINEL"));
  const changedTarget = toolMessages.some((message) => {
    const changedPaths = message.toolResult?.facts.changedPaths;
    return Array.isArray(changedPaths) && changedPaths.some((changedPath) =>
      changedPath.replace(/\\/g, "/").endsWith("/status.txt") || changedPath === "status.txt");
  });
  const durableFacts = (() => {
    const ledger = new ControlPlaneLedger(workspace);
    try {
      return {
        session: ledger.sessions.load(outcome.session.id),
        turns: ledger.turns.listBySession(outcome.session.id),
        toolCalls: ledger.toolCalls.listBySession(outcome.session.id),
        executions: ledger.executions.list({ ownerSessionId: outcome.session.id }),
        wakeSignals: ledger.wakeSignals.list(),
      };
    } finally {
      ledger.close();
    }
  })();
  const durableSession = durableFacts.session;
  const durableTurns = durableFacts.turns;
  const durableToolCalls = durableFacts.toolCalls;
  const durableExecutions = durableFacts.executions;
  const durableWakeSignals = durableFacts.wakeSignals;
  const turnIds = new Set(durableTurns.map((turn) => turn.id));
  const toolCallIds = new Set(durableToolCalls.map((toolCall) => toolCall.callId));
  const wakeExecutionIds = new Set(durableWakeSignals.map((wake) => wake.executionId));
  const foregroundExecutions = durableExecutions.filter((execution) => execution.kind === "foreground");
  const supervisedExecutions = foregroundExecutions.filter((execution) =>
    typeof execution.pid === "number" && Boolean(execution.processIdentity));
  const durableLedgerComplete = Boolean(durableSession && durableSession.revision > 0) &&
    durableTurns.length === 1 && durableTurns.every((turn) => turn.status === "completed") &&
    durableToolCalls.length >= toolMessages.length &&
    durableToolCalls.every((toolCall) => toolCall.status === "success" || toolCall.status === "error") &&
    foregroundExecutions.length >= 2 && foregroundExecutions.every((execution) =>
      (execution.status === "completed" || execution.status === "failed") &&
      execution.ownerSessionId === outcome.session.id &&
      execution.createdBySessionId === outcome.session.id &&
      turnIds.has(execution.parentTurnId) &&
      toolCallIds.has(execution.originToolCallId) &&
      (typeof execution.pid === "number") === Boolean(execution.processIdentity) &&
      execution.controllerGeneration >= 1 &&
      wakeExecutionIds.has(execution.id));

  if (
    assistantToolCalls.length < 1 || toolMessages.length < 3 || !finalAssistant ||
    !String(finalAssistant.content).includes("PRODUCTION_REPAIR_SENTINEL") || repairedValue !== "READY" ||
    !failedVerification || !passedVerification || !changedTarget ||
    !durableLedgerComplete ||
    !eventTypes.includes("tool.completed") || !eventTypes.includes("tool.failed") ||
    !eventTypes.includes("turn.completed")
  ) {
    return {
      id,
      status: "failed",
      fact: `production repair incomplete: calls=${assistantToolCalls.length}, tools=${toolMessages.length}, repaired=${repairedValue}, failedEvidence=${failedVerification}, passedEvidence=${passedVerification}, changedTarget=${changedTarget}, durableLedger=${durableLedgerComplete}, turns=${durableTurns.length}, toolCalls=${durableToolCalls.length}, foregroundExecutions=${foregroundExecutions.length}, supervisedExecutions=${supervisedExecutions.length}, wakes=${durableWakeSignals.length}, final=${finalAssistant?.content ?? "none"}, events=${eventTypes.join(",") || "none"}`,
    };
  }

  return passed(
    id,
    `production repair ready: calls=${assistantToolCalls.length}, reasoningReplay=${assistantReasoningReplay.length}, tools=${toolMessages.length}, failedEvidence=preserved, repaired=${repairedValue}, verification=passed, sqliteRevision=${durableSession!.revision}, turns=${durableTurns.length}, toolCalls=${durableToolCalls.length}, foregroundExecutions=${foregroundExecutions.length}, supervisedExecutions=${supervisedExecutions.length}, wakes=${durableWakeSignals.length}, final="${finalAssistant.content}"`,
  );
}

async function prepareDefect(workspace: string): Promise<void> {
  await fs.writeFile(path.join(workspace, "status.txt"), "BROKEN\n", "utf8");
  await fs.writeFile(path.join(workspace, "verify.cjs"), [
    'const fs = require("node:fs");',
    'const value = fs.readFileSync("status.txt", "utf8").trim();',
    'for (let index = 0; index < 300; index += 1) console.log(`progress ${index}`);',
    'const expected = process.env.KITTY_PRODUCTION_EXPECTED;',
    'if (value !== expected) {',
    '  console.error(`EVIDENCE_ROOT_CAUSE: expected ${expected} but received ${value}`);',
    '  process.exit(1);',
    '}',
    'console.log("PRODUCTION_REPAIR_SENTINEL");',
  ].join("\n"), "utf8");
}
