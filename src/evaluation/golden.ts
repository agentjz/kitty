import fs from "node:fs/promises";
import path from "node:path";

import { runAgentTurn } from "../agent/turn.js";
import { resolveTelegramRuntimeConfig } from "../config/hosts.js";
import { getInitialRuntimeConfig } from "../config/initialConfig.js";
import { getAppPaths } from "../config/paths.js";
import { runHostTurn } from "../host/turn.js";
import { SessionEventStore } from "../session/events.js";
import { SessionStore } from "../session/store.js";
import type { EvaluationCheckResult, GoldenEvaluationScenarioId } from "./types.js";

export async function runGoldenEvaluationScenario(
  rootDir: string,
  id: GoldenEvaluationScenarioId,
): Promise<{ sessionId: string; checks: EvaluationCheckResult[] }> {
  const workspace = path.join(rootDir, ".kitty", "eval-workspaces", id);
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(workspace, "golden.txt"), "before\n", "utf8");

  const initial = getInitialRuntimeConfig();
  const config = {
    ...initial,
    provider: "openai",
    apiKey: "eval-key",
    baseUrl: "https://example.invalid/v1",
    model: "gpt-5.5",
    telegram: resolveTelegramRuntimeConfig(initial.telegram, workspace),
    paths: getAppPaths(workspace),
  };
  const sessionStore = new SessionStore(config.paths.sessionsDir, {
    memorySessionsDir: config.paths.sessionMemoryDir,
  });
  const session = await sessionStore.save(await sessionStore.create(workspace));
  const outcome = await runHostTurn({
    input: `golden ${id}`,
    cwd: workspace,
    config,
    session,
    sessionStore,
    host: "eval",
    stateRootDir: workspace,
  }, {
    runTurn: (options) => runAgentTurn({
      ...options,
      fetchAssistantResponse: createGoldenAssistant(id),
      fetchSessionMemoryResponse: async () => ({
        content: buildGoldenSessionMemory(id),
        toolCalls: [],
      }),
    }),
  });
  const reloaded = await sessionStore.load(outcome.session.id);
  const events = await new SessionEventStore(config.paths.eventsDir).list(reloaded.id);
  return {
    sessionId: reloaded.id,
    checks: [
      {
        id: `golden:${id}:turn`,
        status: outcome.status === "completed" ? "passed" : "failed",
        fact: `host turn status=${outcome.status}`,
        error: outcome.errorMessage,
      },
      buildGoldenWorksetCheck(id, reloaded),
      {
        id: `golden:${id}:events`,
        status: events.some((event) => event.type === "turn.started") && events.some((event) => event.type === "turn.completed")
          ? "passed"
          : "failed",
        fact: `events=${events.map((event) => event.type).join(",") || "none"}`,
      },
    ],
  };
}

function createGoldenAssistant(id: GoldenEvaluationScenarioId) {
  let step = 0;
  return async () => {
    step += 1;
    if (id === "simple-question-stays-small") {
      return {
        content: "这是一个简短回答。",
        toolCalls: [],
      };
    }
    if (id === "tool-read-records-workset" && step === 1) {
      return {
        content: null,
        toolCalls: [{
          id: "call_read_golden",
          type: "function" as const,
          function: {
            name: "read",
            arguments: JSON.stringify({ path: "golden.txt" }),
          },
        }],
      };
    }
    if (id === "edit-records-workset-and-change" && step === 1) {
      return {
        content: null,
        toolCalls: [{
          id: "call_edit_golden",
          type: "function" as const,
          function: {
            name: "edit",
            arguments: JSON.stringify({
              path: "golden.txt",
              edits: [{ oldText: "before\n", newText: "after\n" }],
            }),
          },
        }],
      };
    }
    return {
      content: `Golden scenario ${id} completed.`,
      toolCalls: [],
    };
  };
}

function buildGoldenSessionMemory(id: GoldenEvaluationScenarioId): string {
  return [
    "## Current Focus",
    `Golden evaluation ${id}.`,
    "",
    "## User Constraints",
    "- Keep evaluation deterministic.",
    "",
    "## Decisions",
    "- Use fake provider responses.",
    "",
    "## Open Threads",
    "- None.",
    "",
    "## Verification Facts",
    "- Golden turn completed.",
    "",
    "## Reusable Lessons",
    "- Golden eval checks machine facts.",
  ].join("\n");
}

function buildGoldenWorksetCheck(
  id: GoldenEvaluationScenarioId,
  session: { workset?: { files: Array<{ path: string; readCount: number; changedCount: number; lastChangeId?: string }> } },
): EvaluationCheckResult {
  const file = session.workset?.files.find((entry) => entry.path === "golden.txt");
  const ok = id === "simple-question-stays-small"
    ? !file
    : id === "tool-read-records-workset"
      ? Boolean(file && file.readCount > 0)
      : Boolean(file && file.changedCount > 0 && file.lastChangeId);
  return {
    id: `golden:${id}:workset`,
    status: ok ? "passed" : "failed",
    fact: file
      ? `workset golden.txt read=${file.readCount} changed=${file.changedCount} change=${file.lastChangeId ?? "none"}`
      : "workset golden.txt absent",
  };
}
