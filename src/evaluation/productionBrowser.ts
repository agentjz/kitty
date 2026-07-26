import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { closeProjectCapabilityRuntime } from "../capabilities/index.js";
import { PLAYWRIGHT_CAPABILITY, WEB_CAPABILITY } from "../capabilities/definitions.js";
import { resolveRuntimeConfig } from "../config/store.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { runHostTurn } from "../host/turn.js";
import { SessionEventStore } from "../session/events.js";
import { SessionStore } from "../session/store.js";
import { passed, type EvaluationCheckResult, type ProductionEvaluationCheckId } from "./types.js";

export async function runProductionBrowserCheck(
  id: ProductionEvaluationCheckId,
  rootDir: string,
): Promise<EvaluationCheckResult> {
  const sourceConfig = await resolveRuntimeConfig({ cwd: rootDir });
  if (!sourceConfig.apiKey.trim()) {
    return { id, status: "failed", fact: "production browser turn blocked: KITTY_API_KEY is missing" };
  }

  const workspace = path.join(rootDir, ".kitty", "eval-production", "browser-turn");
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  const code = `CODE_${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const fact = `BROWSER_FACT_${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const server = createChallengeServer({ code, fact });
  await listen(server);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("production browser turn failed to bind local challenge server");
  }

  const config = {
    ...sourceConfig,
    paths: {
      ...sourceConfig.paths,
      dataDir: path.join(workspace, ".kitty"),
      sessionsDir: path.join(workspace, ".kitty", "sessions"),
      changesDir: path.join(workspace, ".kitty", "changes"),
      eventsDir: path.join(workspace, ".kitty", "events"),
    },
    maxOutputTokens: Math.min(sourceConfig.maxOutputTokens, 900),
    contextWindowMessages: Math.min(sourceConfig.contextWindowMessages, 24),
    maxContextChars: Math.min(sourceConfig.maxContextChars, 80_000),
    contextSummaryChars: Math.min(sourceConfig.contextSummaryChars, 8_000),
  };
  seedBrowserCapabilities(workspace);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(workspace));
  const outputPath = path.join(workspace, "browser-result.txt");

  try {
    const outcome = await runHostTurn({
      host: "eval-production-browser",
      input: [
        "Use the real Playwright browser tools for this task; do not simulate browser actions.",
        "Open the challenge URL, click Load challenge, wait until the code is visible, type that visible code into the page, and click Verify.",
        "After the page shows the final BROWSER_FACT value, use the write tool to save exactly that value and nothing else to browser-result.txt.",
        "Do not use shell commands, web tools, source inspection, or prose claims as substitutes for browser interaction.",
        `Challenge URL: http://127.0.0.1:${address.port}/challenge`,
      ].join(" "),
      cwd: workspace,
      stateRootDir: workspace,
      config,
      session,
      sessionStore,
      builtinToolFilter: (tool) => tool.definition.function.name === "write",
      hostToolFilter: (tool) => tool.definition.function.name.startsWith("playwright_browser_"),
    });

    if (outcome.status !== "completed") {
      return {
        id,
        status: "failed",
        fact: `production browser turn failed: status=${outcome.status}, message=${outcome.errorMessage ?? "none"}`,
      };
    }

    const reloaded = await sessionStore.load(outcome.session.id);
    const events = await new SessionEventStore(config.paths.eventsDir).list(outcome.session.id, 80);
    const saved = await fs.readFile(outputPath, "utf8").catch(() => "");
    const assistantToolNames = reloaded.messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.tool_calls ?? [])
      .map((call) => call.function.name);
    const eventTypes = events.map((event) => event.type);
    const ledger = new ControlPlaneLedger(workspace);
    let durableToolNames: string[];
    try {
      durableToolNames = ledger.toolCalls.listBySession(outcome.session.id).map((call) => call.toolName);
    } finally {
      ledger.close();
    }
    const toolNames = [...assistantToolNames, ...durableToolNames];
    const usedNavigate = toolNames.includes("playwright_browser_navigate");
    const usedClick = toolNames.includes("playwright_browser_click");
    const usedTyping = toolNames.some((name) =>
      ["playwright_browser_type", "playwright_browser_fill_form", "playwright_browser_press_key"].includes(name));
    const usedWrite = toolNames.includes("write");
    const usedBrowser = toolNames.some((name) => name.startsWith("playwright_browser_"));

    if (
      saved.trim() !== fact ||
      !usedBrowser ||
      !usedNavigate ||
      !usedClick ||
      !usedTyping ||
      !usedWrite ||
      !eventTypes.includes("tool.completed") ||
      !eventTypes.includes("turn.completed")
    ) {
      return {
        id,
        status: "failed",
        fact: `production browser incomplete: saved=${JSON.stringify(saved.trim())}, expected=${fact}, tools=${toolNames.join(",") || "none"}, events=${eventTypes.join(",") || "none"}`,
      };
    }

    return passed(
      id,
      `production browser ready: tools=${dedupe(toolNames).join(",")}, result=${fact}, session=${outcome.session.id}`,
    );
  } finally {
    await closeProjectCapabilityRuntime(workspace).catch(() => undefined);
    await closeServer(server);
  }
}

function seedBrowserCapabilities(rootDir: string): void {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    ledger.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
    ledger.capabilities.setEnabled(WEB_CAPABILITY, false);
  } finally {
    ledger.close();
  }
}

function createChallengeServer(input: { code: string; fact: string }): http.Server {
  return http.createServer((request, response) => {
    if (request.url !== "/challenge") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Kitty Browser Evaluation</title></head>
<body>
  <main>
    <h1>Kitty Browser Evaluation</h1>
    <button id="load">Load challenge</button>
    <section id="panel" aria-live="polite"></section>
  </main>
  <script>
    const code = ${JSON.stringify(input.code)};
    const fact = ${JSON.stringify(input.fact)};
    const panel = document.querySelector("#panel");
    document.querySelector("#load").addEventListener("click", () => {
      panel.textContent = "Loading challenge...";
      setTimeout(() => {
        panel.innerHTML = [
          "<p>Visible code: <strong id='code'>" + code + "</strong></p>",
          "<label>Code input <input id='answer' aria-label='Code input' autocomplete='off'></label>",
          "<button id='verify'>Verify</button>",
          "<p id='result' aria-live='polite'></p>"
        ].join("");
      }, 250);
    });
    document.addEventListener("click", (event) => {
      if (event.target && event.target.id === "verify") {
        const answer = document.querySelector("#answer").value.trim();
        document.querySelector("#result").textContent = answer === code ? fact : "Try again";
      }
    });
  </script>
</body>
</html>`);
  });
}

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
