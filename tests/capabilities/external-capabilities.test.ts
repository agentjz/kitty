import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createWebDownloadTool, createWebFetchTool, createWebSearchTool } from "../../src/capabilities/web.js";
import { WEB_DOWNLOAD_MAX_BYTES } from "../../src/capabilities/webShared.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createSessionRecord } from "../../src/session/store.js";
import type { RegisteredTool, ToolContext } from "../../src/tools/core/types.js";
import { createTempWorkspace, createTestRuntimeConfig, createToolContext } from "../helpers.js";

test("web search settles known HTTP failures and never replays an already dispatched operation", async (t) => {
  const root = await createTempWorkspace("web-search-terminal", t);
  const config = createTestRuntimeConfig(root);
  const context = await createOwnedToolContext(root, "known", config, "web_search", { query: "Kitty agent" });
  let calls = 0;
  const tool = createWebSearchTool({
    fetch: async () => {
      calls += 1;
      return new Response("invalid request", { status: 400, headers: { "content-type": "text/plain" } });
    },
  });

  const known = await tool.execute(JSON.stringify({ query: "Kitty agent" }), context);
  assert.equal(known.ok, false);
  assert.equal(known.metadata?.external?.dispatchState, "settled");
  assert.equal(known.metadata?.external?.outcome, undefined);

  const replay = await tool.execute(JSON.stringify({ query: "Kitty agent" }), context);
  assert.equal(replay.metadata?.external?.outcome, "uncertain");
  assert.match(replay.output, /will not replay/i);
  assert.equal(calls, 1);
});

test("web search returns numbered sources and bounded durable RSS evidence", async (t) => {
  const root = await createTempWorkspace("web-search-evidence", t);
  const config = createTestRuntimeConfig(root);
  const args = { query: "What is the current fact?" };
  const context = await createOwnedToolContext(root, "success", config, "web_search", args);
  const largeSnippet = "x".repeat(300_000);
  const rss = buildRss([
    { title: "Official source", url: "https://example.test/official", description: "The current fact is grounded." },
    { title: "Second source", url: "https://example.test/second", description: "A second corroborating fact." },
    { title: "Large source", url: "https://example.test/large", description: largeSnippet },
  ]);
  const result = await createWebSearchTool({
    fetch: async () => new Response(rss, { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } }),
  }).execute(JSON.stringify(args), context);

  assert.equal(result.ok, true, result.output);
  const output = JSON.parse(result.output) as {
    results: Array<{ id: number; title: string; url: string; snippet: string }>;
    evidencePath: string;
    evidenceBytes: number;
    evidenceTruncated: boolean;
  };
  assert.deepEqual(output.results.slice(0, 2).map(({ id, url }) => ({ id, url })), [
    { id: 1, url: "https://example.test/official" },
    { id: 2, url: "https://example.test/second" },
  ]);
  assert.equal(output.results[0]?.snippet, "The current fact is grounded.");
  assert.ok(output.evidenceBytes <= 256_000);
  assert.equal(output.evidenceTruncated, true);
  const evidence = JSON.parse(await fs.readFile(path.join(root, output.evidencePath), "utf8")) as Record<string, unknown>;
  assert.equal(evidence.query, args.query);
});

test("web fetch projects readable HTML and persists the raw response as evidence", async (t) => {
  const root = await createTempWorkspace("web-fetch", t);
  const config = createTestRuntimeConfig(root);
  const args = { url: "https://example.test/article" };
  const context = await createOwnedToolContext(root, "fetch", config, "web_fetch", args);
  const result = await createWebFetchTool({
    fetch: async () => new Response(
      "<!doctype html><html><head><title>Evidence page</title><style>hidden</style></head><body><main>Verified fact</main><script>ignored()</script></body></html>",
      { status: 200, headers: { "content-type": "text/html; charset=utf-8", etag: '"v1"' } },
    ),
  }).execute(JSON.stringify(args), context);

  assert.equal(result.ok, true, result.output);
  const output = JSON.parse(result.output) as { title: string; text: string; evidencePath: string; headers: Record<string, string> };
  assert.equal(output.title, "Evidence page");
  assert.equal(output.text, "Verified fact");
  assert.equal(output.headers.etag, '"v1"');
  assert.match(await fs.readFile(path.join(root, output.evidencePath), "utf8"), /Verified fact/u);
});

test("web download writes exact bytes atomically and returns a file artifact", async (t) => {
  const root = await createTempWorkspace("web-download", t);
  const config = createTestRuntimeConfig(root);
  const args = { url: "https://example.test/archive.bin", path: "downloads/archive.bin" };
  const context = await createOwnedToolContext(root, "download", config, "web_download", args);
  const bytes = Buffer.from([0, 1, 2, 3, 254, 255]);
  const result = await createWebDownloadTool({
    fetch: async () => new Response(bytes, { status: 200, headers: { "content-type": "application/octet-stream" } }),
  }).execute(JSON.stringify(args), context);

  assert.equal(result.ok, true, result.output);
  assert.deepEqual(await fs.readFile(path.join(root, args.path)), bytes);
  assert.equal(result.metadata?.artifacts?.[0]?.path, path.join(root, args.path));
  assert.deepEqual(result.metadata?.changedPaths, [path.join(root, args.path)]);
});

test("web download enforces its byte limit without replacing an existing target", async (t) => {
  const root = await createTempWorkspace("web-download-limit", t);
  const config = createTestRuntimeConfig(root);
  const args = { url: "https://example.test/too-large.bin", path: "downloads/existing.bin" };
  const target = path.join(root, args.path);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, "keep-me", "utf8");
  const context = await createOwnedToolContext(root, "limit", config, "web_download", args);
  const result = await createWebDownloadTool({
    fetch: async () => new Response("small-body", {
      status: 200,
      headers: { "content-length": String(WEB_DOWNLOAD_MAX_BYTES + 1) },
    }),
  }).execute(JSON.stringify(args), context);

  assert.equal(result.ok, false);
  assert.equal(result.metadata?.external?.dispatchState, "settled");
  assert.equal(await fs.readFile(target, "utf8"), "keep-me");
});

test("web fetch and download report a lost response as uncertain", async (t) => {
  const root = await createTempWorkspace("web-uncertain", t);
  const config = createTestRuntimeConfig(root);
  for (const [suffix, tool, args] of [
    ["fetch", createWebFetchTool({ fetch: lostResponse }), { url: "https://example.test/page" }],
    ["download", createWebDownloadTool({ fetch: lostResponse }), { url: "https://example.test/file", path: "file.bin" }],
  ] as const) {
    const context = await createOwnedToolContext(root, suffix, config, tool.definition.function.name, args);
    const result = await tool.execute(JSON.stringify(args), context);
    assert.equal(result.ok, false);
    assert.equal(result.metadata?.external?.dispatchState, "dispatched");
    assert.equal(result.metadata?.external?.outcome, "uncertain");
  }
});

async function lostResponse(): Promise<Response> {
  throw new TypeError("socket closed after request dispatch");
}

function buildRss(items: Array<{ title: string; url: string; description: string }>): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Search</title>${items.map((item) => (
    `<item><title>${item.title}</title><link>${item.url}</link><description>${item.description}</description></item>`
  )).join("")}</channel></rss>`;
}

async function createOwnedToolContext(
  root: string,
  suffix: string,
  config: ReturnType<typeof createTestRuntimeConfig>,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolContext> {
  const ledger = new ControlPlaneLedger(root);
  try {
    const session = ledger.sessions.save(await createSessionRecord(root));
    const turn = ledger.turns.admit({ sessionId: session.id, input: suffix, inputSource: "external" });
    const owner = ledger.turns.claim(turn.id)!;
    const callId = `${toolName}-${suffix}`;
    ledger.toolCalls.start({
      callId,
      turnId: turn.id,
      sessionId: session.id,
      toolName,
      argumentsJson: JSON.stringify(args),
      effect: "external",
    });
    ledger.toolCalls.activate({ callId, turnId: turn.id, ownerToken: owner.ownerToken!, ownerGeneration: owner.ownerGeneration });
    return {
      ...createToolContext(root),
      config,
      sessionId: session.id,
      ownerSessionId: session.id,
      turnId: turn.id,
      toolCallId: callId,
      turnOwnerToken: owner.ownerToken,
      turnOwnerGeneration: owner.ownerGeneration,
    };
  } finally {
    ledger.close();
  }
}
