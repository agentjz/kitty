import fs from "node:fs/promises";
import path from "node:path";

import { resolveRuntimeConfig } from "../config/store.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import {
  BackgroundExecutionStore,
  isBackgroundExecutionActive,
  terminateBackgroundExecution,
  waitForRegisteredBackgroundProcess,
} from "../execution/background.js";
import { createBackgroundTools } from "../extensions/tools/background/index.js";
import { runHostTurn } from "../host/turn.js";
import { SessionEventStore } from "../session/events.js";
import { SessionStore } from "../session/store.js";
import { passed, type EvaluationCheckResult, type ProductionEvaluationCheckId } from "./types.js";

const PROGRESS_SENTINEL = "PRODUCTION_BACKGROUND_PROGRESS_SENTINEL";
const FINAL_SENTINEL = "PRODUCTION_BACKGROUND_FINAL_SENTINEL";

export async function runProductionBackgroundCheck(
  id: ProductionEvaluationCheckId,
  rootDir: string,
): Promise<EvaluationCheckResult> {
  const sourceConfig = await resolveRuntimeConfig({ cwd: rootDir });
  if (!sourceConfig.apiKey.trim()) {
    return { id, status: "failed", fact: "production background turn blocked: KITTY_API_KEY is missing" };
  }

  const workspace = path.join(rootDir, ".kitty", "eval-production", "background-turn");
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  await prepareBackgroundTask(workspace);
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
    contextWindowMessages: Math.min(sourceConfig.contextWindowMessages, 24),
    maxContextChars: Math.min(sourceConfig.maxContextChars, 80_000),
    contextSummaryChars: Math.min(sourceConfig.contextSummaryChars, 8_000),
  };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(workspace));

  try {
    const outcome = await runHostTurn({
      host: "eval-production",
      input: [
        "Execute this task; do not simulate or narrate tool calls.",
        "First make a real background_run function call for `node staged-background.cjs` and keep this same turn active.",
        `Use real background_wait function calls until you first observe ${PROGRESS_SENTINEL} while the execution is still running.`,
        `Then call background_wait again until it is settled and you observe ${FINAL_SENTINEL}.`,
        "Shell code blocks, invented IDs, and prose claims do not count as tool execution.",
        "Do not finish after progress and do not replace background_wait with commentary.",
        `Finish with one short plain English sentence containing ${FINAL_SENTINEL}.`,
      ].join(" "),
      cwd: workspace,
      stateRootDir: workspace,
      config,
      session,
      sessionStore,
      builtinToolFilter: () => false,
      extraTools: createBackgroundTools().filter((tool) =>
        ["background_run", "background_wait"].includes(tool.definition.function.name)),
    });
    if (outcome.status !== "completed") {
      return {
        id,
        status: "failed",
        fact: `production background turn failed: status=${outcome.status}, message=${outcome.errorMessage ?? "none"}`,
      };
    }

    const reloaded = await sessionStore.load(outcome.session.id);
    const events = await new SessionEventStore(config.paths.eventsDir).list(outcome.session.id, 80);
    const assistantToolNames = reloaded.messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.tool_calls ?? [])
      .map((call) => call.function.name);
    const waitEvidence = reloaded.messages
      .filter((message) => message.role === "tool" && message.name === "background_wait")
      .map((message) => message.toolResult?.modelView ?? String(message.content ?? ""));
    const finalAssistant = [...reloaded.messages].reverse()
      .find((message) => message.role === "assistant" && message.content?.trim());
    const durable = readDurableFacts(workspace, outcome.session.id);
    const backgroundExecutions = durable.executions.filter((execution) => execution.kind === "background");
    const execution = backgroundExecutions[0];
    const turnIds = new Set(durable.turns.map((turn) => turn.id));
    const toolCallIds = new Set(durable.toolCalls.map((call) => call.callId));
    const progressObserved = waitEvidence.some((evidence) =>
      evidence.includes("wait: progress") && evidence.includes(PROGRESS_SENTINEL));
    const settledObserved = waitEvidence.some((evidence) =>
      evidence.includes("wait: settled") && evidence.includes(FINAL_SENTINEL));
    const durableComplete = durable.turns.length === 1 && durable.turns[0]?.status === "completed" &&
      durable.toolCalls.length >= 3 && durable.toolCalls.every((call) => call.status === "success") &&
      backgroundExecutions.length === 1 && execution?.status === "completed" &&
      execution.ownerSessionId === outcome.session.id &&
      execution.createdBySessionId === outcome.session.id &&
      typeof execution.pid === "number" && Boolean(execution.processIdentity) &&
      turnIds.has(execution.parentTurnId) && toolCallIds.has(execution.originToolCallId) &&
      durable.wakeSignals.filter((wake) => wake.executionId === execution.id).length === 1;
    const waitCount = assistantToolNames.filter((name) => name === "background_wait").length;
    const eventTypes = events.map((event) => event.type);

    if (
      assistantToolNames[0] !== "background_run" || waitCount < 2 ||
      !progressObserved || !settledObserved || !durableComplete ||
      !finalAssistant?.content?.includes(FINAL_SENTINEL) ||
      !eventTypes.includes("tool.completed") || !eventTypes.includes("turn.completed")
    ) {
      return {
        id,
        status: "failed",
        fact: `production background incomplete: tools=${assistantToolNames.join(",") || "none"}, waits=${waitCount}, progress=${progressObserved}, settled=${settledObserved}, durable=${durableComplete}, turns=${durable.turns.length}, executions=${backgroundExecutions.length}, wakes=${durable.wakeSignals.length}, final=${finalAssistant?.content ?? "none"}`,
      };
    }

    return passed(
      id,
      `production background ready: tools=${assistantToolNames.join(",")}, waits=${waitCount}, progress=observed, settled=observed, turns=${durable.turns.length}, executions=${backgroundExecutions.length}, wakes=${durable.wakeSignals.length}, final="${finalAssistant.content}"`,
    );
  } finally {
    await stopRemainingBackgroundProcesses(workspace, session.id);
  }
}

function readDurableFacts(rootDir: string, sessionId: string) {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    return {
      turns: ledger.turns.listBySession(sessionId),
      toolCalls: ledger.toolCalls.listBySession(sessionId),
      executions: ledger.executions.list({ ownerSessionId: sessionId }),
      wakeSignals: ledger.wakeSignals.list(),
    };
  } finally {
    ledger.close();
  }
}

async function stopRemainingBackgroundProcesses(rootDir: string, sessionId: string): Promise<void> {
  const store = new BackgroundExecutionStore(rootDir);
  for (const execution of store.listAll(sessionId).filter(isBackgroundExecutionActive)) {
    try {
      terminateBackgroundExecution(rootDir, execution.id, sessionId);
      await waitForRegisteredBackgroundProcess(execution.id);
    } catch {
      // Durable lease reconciliation owns any process that cannot be stopped here.
    }
  }
}

async function prepareBackgroundTask(workspace: string): Promise<void> {
  await fs.writeFile(path.join(workspace, "staged-background.cjs"), [
    "let step = 0;",
    "const timer = setInterval(() => {",
    "  step += 1;",
    `  console.log(\`\${"p".repeat(280)}:${PROGRESS_SENTINEL}:\${step}\`);`,
    "}, 5_000);",
    "setTimeout(() => {",
    "  clearInterval(timer);",
    `  console.log("${FINAL_SENTINEL}");`,
    "}, 20_000);",
  ].join("\n"), "utf8");
}
