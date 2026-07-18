import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgnesImageRequest,
  buildAgnesVideoCreateRequest,
  buildAgnesVideoPollUrl,
  normalizeAgnesImageResponse,
  normalizeAgnesVideoCreateResponse,
  normalizeAgnesVideoPollResponse,
} from "../../src/media/providers/agnes.js";

test("Agnes image request keeps response_format inside extra_body", () => {
  const request = buildAgnesImageRequest({
    baseUrl: "https://apihub.agnes-ai.com/v1",
    apiKey: "secret",
    model: "agnes-image-2.1-flash",
    prompt: "a small red kite",
    size: "1K",
    ratio: "1:1",
    responseFormat: "url",
  });
  assert.equal(request.endpoint, "https://apihub.agnes-ai.com/v1/images/generations");
  assert.equal(request.headers.Authorization, "Bearer secret");
  const body = JSON.parse(request.body!);
  assert.deepEqual(body.extra_body, { response_format: "url" });
  assert.equal("response_format" in body, false);
});

test("Agnes image editing keeps references in the provider-specific body", () => {
  const request = buildAgnesImageRequest({
    baseUrl: "https://apihub.agnes-ai.com/v1",
    apiKey: "secret",
    model: "agnes-image-2.1-flash",
    prompt: "replace the sky",
    size: "2K",
    images: ["https://example.test/source.png", "data:image/png;base64,iVBORw0KGgo="],
    responseFormat: "b64_json",
  });
  const body = JSON.parse(request.body!);
  assert.deepEqual(body.extra_body, {
    response_format: "b64_json",
    image: ["https://example.test/source.png", "data:image/png;base64,iVBORw0KGgo="],
  });
  assert.equal("image" in body, false);
});

test("Agnes media requests reject invalid dimensions and references before POST", () => {
  const imageInput = {
    baseUrl: "https://apihub.agnes-ai.com/v1",
    apiKey: "secret",
    model: "agnes-image-2.1-flash",
    prompt: "test",
    size: "1K",
    responseFormat: "url" as const,
  };
  assert.throws(() => buildAgnesImageRequest({ ...imageInput, ratio: "5:4" }), /ratio/iu);
  assert.throws(() => buildAgnesImageRequest({ ...imageInput, images: ["C:\\local.png"] }), /HTTP\(S\).*Data URI/iu);
  assert.throws(() => buildAgnesVideoCreateRequest({
    baseUrl: imageInput.baseUrl, apiKey: "secret", model: "agnes-video-v2.0", prompt: "test", numFrames: 80,
  }), /8n \+ 1/iu);
  assert.throws(() => buildAgnesVideoCreateRequest({
    baseUrl: imageInput.baseUrl, apiKey: "secret", model: "agnes-video-v2.0", prompt: "test", width: 1000,
  }), /multiple of 64/iu);
  assert.throws(() => buildAgnesVideoCreateRequest({
    baseUrl: imageInput.baseUrl, apiKey: "secret", model: "agnes-video-v2.0", prompt: "test",
    keyframes: ["https://example.test/1.png", "https://example.test/2.png", "https://example.test/3.png"],
  }), /1 or 2/iu);
});

test("Agnes video create and poll use video_id, never task_id", () => {
  const create = buildAgnesVideoCreateRequest({
    baseUrl: "https://apihub.agnes-ai.com/v1",
    apiKey: "secret",
    model: "agnes-video-v2.0",
    prompt: "a three second sunrise",
    width: 1152,
    height: 768,
    numFrames: 81,
    frameRate: 24,
  });
  assert.equal(create.endpoint, "https://apihub.agnes-ai.com/v1/videos");
  assert.equal(JSON.parse(create.body!).num_frames, 81);
  assert.match(buildAgnesVideoPollUrl("https://apihub.agnes-ai.com/v1", "video_123"), /agnesapi\?video_id=video_123$/u);
  assert.match(buildAgnesVideoPollUrl("https://apihub.agnes-ai.com/v1", "task_123"), /agnesapi\?video_id=task_123$/u);
  assert.equal(buildAgnesVideoPollUrl("https://apihub.agnes-ai.com/v1", "task_123").includes("task_id="), false);
  assert.throws(() => buildAgnesVideoPollUrl("https://apihub.agnes-ai.com/v1", "../escape"), /video_id/iu);
});

test("Agnes response normalization rejects missing media facts", () => {
  assert.deepEqual(normalizeAgnesImageResponse({ data: [{ url: "https://example.test/a.png" }] }), {
    kind: "url",
    url: "https://example.test/a.png",
  });
  assert.deepEqual(normalizeAgnesVideoCreateResponse({ video_id: "video_1", status: "queued", progress: 0 }), {
    videoId: "video_1",
    status: "queued",
    progress: 0,
  });
  assert.throws(() => normalizeAgnesVideoCreateResponse({ task_id: "task_1", status: "queued" }), /video_id/iu);
  assert.deepEqual(normalizeAgnesVideoPollResponse({ id: "task_1", status: "completed", url: "https://example.test/video.mp4" }, "task_1"), {
    videoId: "task_1",
    status: "completed",
    url: "https://example.test/video.mp4",
  });
  assert.throws(() => normalizeAgnesVideoPollResponse({ id: "task_other", status: "queued" }, "task_1"), /did not match/iu);
  assert.throws(() => normalizeAgnesImageResponse({ data: [{}] }), /image response/i);
  assert.throws(() => normalizeAgnesImageResponse({ data: [{ url: "file:///tmp/image.png" }] }), /image response/i);
});
