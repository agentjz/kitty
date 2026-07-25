import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { ChangeStore } from "../src/agent/changes/store.js";
import { buildToolResultEnvelope } from "../src/agent/toolResults/evidenceBuilder.js";
import { PLAYWRIGHT_CAPABILITY } from "../src/capabilities/definitions.js";
import {
  acquireProjectCapabilityRuntime,
  closeProjectCapabilityRuntime,
} from "../src/capabilities/runtimePool.js";
import { createWebDownloadTool, createWebFetchTool, createWebSearchTool } from "../src/capabilities/web.js";
import { resolveTelegramRuntimeConfig, resolveWeixinRuntimeConfig } from "../src/config/hosts.js";
import { getInitialRuntimeConfig } from "../src/config/initialConfig.js";
import { getAppPaths } from "../src/config/paths.js";
import { ControlPlaneLedger } from "../src/control/ledger.js";
import { isProcessAlive } from "../src/execution/process.js";
import { createSessionRecord } from "../src/session/store.js";
import type { RegisteredTool, ToolContext } from "../src/tools/core/types.js";
import type { RuntimeConfig, ToolExecutionResult } from "../src/types.js";

void main();

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "playwright" && mode !== "web") {
    throw new Error("Usage: node .test-build/scripts/verify-live-capabilities.js <playwright|web>");
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `kitty-live-${mode}-`));
  try {
    if (mode === "playwright") await verifyPlaywright(root);
    else await verifyWeb(root);
  } finally {
    await closeProjectCapabilityRuntime(root).catch(() => undefined);
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function verifyPlaywright(root: string): Promise<void> {
  const config = createRuntimeConfig(root);
  const seed = new ControlPlaneLedger(root);
  seed.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  seed.close();
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Kitty live check</title><main><h1>Kitty Playwright MCP live verification</h1></main>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const first = await acquireProjectCapabilityRuntime({ cwd: root, stateRootDir: root, config });
    const firstState = readCapability(root, "playwright");
    assert.equal(firstState.status, "ready");
    assert.ok(firstState.childPid && isProcessAlive(firstState.childPid));
    const navigate = findTool(first.sources.flatMap((source) => source.tools), "playwright_browser_navigate");
    const navigation = await executeDurableTool(root, config, navigate, {
      url: `http://127.0.0.1:${address.port}/live`,
    }, "navigate");
    assert.equal(navigation.ok, true, navigation.output);
    first.release();

    const second = await acquireProjectCapabilityRuntime({ cwd: root, stateRootDir: root, config });
    const secondState = readCapability(root, "playwright");
    assert.equal(secondState.childPid, firstState.childPid);
    assert.equal(secondState.ownerGeneration, firstState.ownerGeneration);
    const snapshot = findTool(second.sources.flatMap((source) => source.tools), "playwright_browser_snapshot");
    const page = await executeDurableTool(root, config, snapshot, {}, "snapshot");
    assert.equal(page.ok, true, page.output);
    assert.match(page.output, /Kitty Playwright MCP live verification/u);
    assert.ok(page.metadata?.artifacts?.[0]?.path);
    await fs.access(page.metadata!.artifacts![0]!.path);
    second.release();

    const pid = secondState.childPid!;
    await closeProjectCapabilityRuntime(root);
    assert.equal(isProcessAlive(pid), false, `Playwright MCP pid ${pid} survived runtime close.`);
    const closed = readCapability(root, "playwright");
    assert.equal(closed.status, "stopped");
    assert.equal(closed.ownerToken, undefined);
    process.stdout.write(`${JSON.stringify({
      capability: "playwright",
      status: "passed",
      pid,
      reusedPid: true,
      toolCount: second.toolNames.filter((name) => name.startsWith("playwright_")).length,
      processStopped: true,
    }, null, 2)}\n`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function verifyWeb(root: string): Promise<void> {
  const config = createRuntimeConfig(root);
  const search = await executeDurableTool(root, config, createWebSearchTool(), {
    query: "site:nodejs.org Node.js official documentation",
  }, "search");
  assert.equal(search.ok, true, search.output);
  const searchOutput = JSON.parse(search.output) as {
    results: Array<{ id: number; title: string; url: string }>;
    evidencePath: string;
    noResults: boolean;
  };
  assert.equal(searchOutput.noResults, false);
  assert.ok(searchOutput.results.length > 0);
  await fs.access(path.join(root, searchOutput.evidencePath));

  const readableResult = searchOutput.results.find((result) => new URL(result.url).hostname.endsWith("nodejs.org"));
  assert.ok(readableResult, `Bing returned no nodejs.org result: ${JSON.stringify(searchOutput.results)}`);
  const read = await executeDurableTool(root, config, createWebFetchTool(), {
    url: readableResult.url,
  }, "fetch");
  assert.equal(read.ok, true, read.output);
  const readOutput = JSON.parse(read.output) as { text: string; evidencePath: string; finalUrl: string };
  assert.ok(readOutput.text.length > 0);
  await fs.access(path.join(root, readOutput.evidencePath));

  const downloadPath = "downloads/node-releases.json";
  const download = await executeDurableTool(root, config, createWebDownloadTool(), {
    url: "https://nodejs.org/dist/index.json",
    path: downloadPath,
  }, "download");
  assert.equal(download.ok, true, download.output);
  const downloadOutput = JSON.parse(download.output) as { bytes: number; sha256: string; path: string };
  assert.ok(downloadOutput.bytes > 100);
  assert.match(downloadOutput.sha256, /^[a-f0-9]{64}$/u);
  const downloaded = await fs.readFile(path.join(root, downloadPath), "utf8");
  assert.ok(Array.isArray(JSON.parse(downloaded)));

  const state = readCapability(root, "web");
  assert.equal(state.status, "ready");
  process.stdout.write(`${JSON.stringify({
    capability: "web",
    status: "passed",
    searchResultCount: searchOutput.results.length,
    sources: searchOutput.results,
    searchEvidencePath: searchOutput.evidencePath,
    fetchedUrl: readOutput.finalUrl,
    fetchEvidencePath: readOutput.evidencePath,
    downloadedPath: downloadOutput.path,
    downloadedBytes: downloadOutput.bytes,
  }, null, 2)}\n`);
}

async function executeDurableTool(
  root: string,
  config: RuntimeConfig,
  tool: RegisteredTool,
  args: Record<string, unknown>,
  suffix: string,
): Promise<ToolExecutionResult> {
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({ sessionId: session.id, input: suffix, inputSource: "external" });
  const owner = ledger.turns.claim(turn.id)!;
  const callId = `${suffix}-${Date.now()}`;
  const rawArgs = JSON.stringify(args);
  ledger.toolCalls.start({
    callId,
    turnId: turn.id,
    sessionId: session.id,
    toolName: tool.definition.function.name,
    argumentsJson: rawArgs,
    effect: tool.effect ?? "external",
  });
  ledger.toolCalls.activate({
    callId,
    turnId: turn.id,
    ownerToken: owner.ownerToken!,
    ownerGeneration: owner.ownerGeneration,
  });
  ledger.close();
  const context: ToolContext = {
    config,
    cwd: root,
    sessionId: session.id,
    ownerSessionId: session.id,
    turnId: turn.id,
    toolCallId: callId,
    turnOwnerToken: owner.ownerToken,
    turnOwnerGeneration: owner.ownerGeneration,
    runtimeState: {},
    projectContext: {
      rootDir: root,
      stateRootDir: root,
      cwd: root,
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
      skills: [],
    },
    changeStore: new ChangeStore(config.paths.changesDir),
    createToolRegistry: () => ({ definitions: [], execute: async () => ({ ok: false, output: "unavailable" }) }),
  };
  const result = await tool.execute(rawArgs, context);
  const terminal = new ControlPlaneLedger(root);
  const envelope = buildToolResultEnvelope({
    callId,
    toolName: tool.definition.function.name,
    rawArguments: rawArgs,
    cwd: root,
    result,
  });
  terminal.toolCalls.settle({
    callId,
    turnId: turn.id,
    ownerToken: owner.ownerToken!,
    ownerGeneration: owner.ownerGeneration,
    result: envelope,
  });
  terminal.turns.beginClosing(turn.id, owner.ownerToken!, owner.ownerGeneration);
  terminal.turns.finish(turn.id, owner.ownerToken!, owner.ownerGeneration, envelope.status === "success" ? "completed" : "failed");
  terminal.close();
  return result;
}

function createRuntimeConfig(root: string): RuntimeConfig {
  const initial = getInitialRuntimeConfig();
  return {
    ...initial,
    provider: "agnes",
    apiKey: "live-verification-only",
    media: { ...initial.media, apiKey: "" },
    capabilities: structuredClone(initial.capabilities),
    baseUrl: "https://apihub.agnes-ai.com/v1",
    model: "agnes-2.0-flash",
    thinking: "enabled",
    telegram: resolveTelegramRuntimeConfig(initial.telegram, root),
    weixin: resolveWeixinRuntimeConfig(initial.weixin, root),
    paths: getAppPaths(root),
  };
}

function findTool(tools: readonly RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((candidate) => candidate.definition.function.name === name);
  if (!tool) throw new Error(`Live capability did not expose ${name}.`);
  return tool;
}

function readCapability(root: string, id: string) {
  const ledger = new ControlPlaneLedger(root);
  try {
    const state = ledger.capabilities.load(id);
    if (!state) throw new Error(`Capability state missing: ${id}.`);
    return state;
  } finally {
    ledger.close();
  }
}
