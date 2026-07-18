import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createMediaTools } from "../../src/extensions/tools/media/index.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const MP4 = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]);

test("media extension exposes image and mixed-result video tools", () => {
  const tools = createMediaTools();
  assert.deepEqual(tools.map((tool) => tool.definition.function.name), ["generate_image", "generate_video"]);
  assert.equal(tools[0]?.changeSignal, "required");
  assert.equal(tools[1]?.changeSignal, undefined);
  assert.deepEqual(tools.map((tool) => tool.effect), ["external", "external"]);
});

test("generate_image writes Base64 media, records binary history, and supports undo", async (t) => {
  const root = await createTempWorkspace("media-image-tool", t);
  const context = createToolContext(root);
  const workset: Array<{ changeId?: string }> = [];
  context.recordWorksetFile = async (input) => { workset.push({ changeId: input.changeId }); };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [{ b64_json: PNG.toString("base64") }] });
  t.after(() => { globalThis.fetch = originalFetch; });

  const target = path.join("generated", "base64.png");
  const result = await createMediaTools()[0]!.execute(JSON.stringify({
    prompt: "a test image",
    response_format: "b64_json",
    output_path: target,
  }), context);
  const payload = parseToolJson(result.output);
  const absolute = path.join(root, target);
  assert.equal(result.ok, true);
  assert.deepEqual(await fs.readFile(absolute), PNG);
  assert.deepEqual(result.metadata?.changedPaths, [absolute]);
  assert.equal(result.metadata?.artifacts?.[0]?.mimeType, "image/png");
  assert.equal(typeof payload.changeId, "string");
  assert.deepEqual(workset, [{ changeId: payload.changeId as string }]);

  await context.changeStore.undo(String(payload.changeId));
  await assert.rejects(() => fs.access(absolute), { code: "ENOENT" });
});

test("generate_video persists video_id, rate-limits early polls, then saves completion", async (t) => {
  const root = await createTempWorkspace("media-video-tool", t);
  const context = createToolContext(root);
  const tools = createMediaTools();
  const video = tools[1]!;
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    if (String(init?.method) === "POST") return Response.json({ video_id: "video_acceptance", status: "queued", progress: 0 });
    if (String(url).includes("/agnesapi?")) return Response.json({
      video_id: "video_acceptance", status: "completed", url: "https://cdn.example.test/video.mp4", seconds: "3.4",
    });
    return new Response(MP4, { headers: { "content-type": "video/mp4" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const created = await video.execute(JSON.stringify({
    operation: "create", prompt: "a short test", output_path: "generated/video.mp4", num_frames: 81,
  }), context);
  assert.equal(created.metadata?.changedPaths, undefined);
  assert.equal(parseToolJson(created.output).videoId, "video_acceptance");
  const recordPath = path.join(getProjectStatePaths(root).extensionsDir, "media", "video-tasks", "video_acceptance.json");
  const record = JSON.parse(await fs.readFile(recordPath, "utf8")) as Record<string, unknown>;
  assert.equal(record.videoId, "video_acceptance");

  const early = await video.execute(JSON.stringify({ operation: "poll", video_id: "video_acceptance" }), context);
  assert.equal(parseToolJson(early.output).status, "waiting");
  assert.equal(early.metadata?.changedPaths, undefined);
  assert.equal(calls, 1);

  record.nextPollAt = new Date(0).toISOString();
  await fs.writeFile(recordPath, `${JSON.stringify(record)}\n`, "utf8");
  const completed = await video.execute(JSON.stringify({ operation: "poll", video_id: "video_acceptance" }), context);
  const completedPayload = parseToolJson(completed.output);
  assert.equal(completedPayload.status, "completed");
  assert.equal(calls, 3);
  assert.deepEqual(await fs.readFile(path.join(root, "generated", "video.mp4")), MP4);
  assert.equal(completed.metadata?.artifacts?.[0]?.mimeType, "video/mp4");
  assert.equal(typeof completed.metadata?.changeId, "string");
});

test("generate_video preserves provider failures and aborts before polling", async (t) => {
  const root = await createTempWorkspace("media-video-failures", t);
  const context = createToolContext(root);
  const video = createMediaTools()[1]!;
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ video_id: "video_failed", status: "failed", error: { message: "rejected" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(() => video.execute(JSON.stringify({ operation: "poll", video_id: "video_failed" }), context), /generation failed/iu);
  assert.equal(calls, 1);

  const controller = new AbortController();
  context.abortSignal = controller.signal;
  const pending = video.execute(JSON.stringify({ operation: "poll", video_id: "video_wait", wait_seconds: 1 }), context);
  controller.abort();
  await assert.rejects(() => pending, { name: "AbortError" });
  assert.equal(calls, 1);
});

test("generate_video rejects completed responses without a download URL", async (t) => {
  const root = await createTempWorkspace("media-video-no-url", t);
  const context = createToolContext(root);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ video_id: "video_no_url", status: "completed" });
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(
    () => createMediaTools()[1]!.execute(JSON.stringify({ operation: "poll", video_id: "video_no_url" }), context),
    /did not contain a download URL/iu,
  );
});
