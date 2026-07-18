import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMediaConfig } from "../../src/config/media.js";

test("media config normalizes Agnes image and video defaults", () => {
  const config = normalizeMediaConfig({
    provider: "agnes",
    baseUrl: "https://apihub.agnes-ai.com/v1/",
    imageModel: "agnes-image-2.1-flash",
    videoModel: "agnes-video-v2.0",
    requestTimeoutMs: 60_000,
    pollIntervalMs: 15_000,
  });
  assert.equal(config.baseUrl, "https://apihub.agnes-ai.com/v1");
  assert.equal(config.pollIntervalMs, 15_000);
});

test("media config rejects unsafe poll and timeout values", () => {
  assert.throws(() => normalizeMediaConfig({
    provider: "agnes",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    imageModel: "agnes-image-2.1-flash",
    videoModel: "agnes-video-v2.0",
    requestTimeoutMs: 100,
    pollIntervalMs: 1,
  }), /KITTY_MEDIA_(REQUEST_TIMEOUT|POLL_INTERVAL)_MS/);
});
