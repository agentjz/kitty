import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MEDIA_CONFIG } from "../../src/config/media.js";
import { probeMediaConnection } from "../../src/media/connection.js";

test("media probe is read-only and authenticates against the configured models endpoint", async () => {
  const requests: Array<{ url: string; method: string; authorization?: string }> = [];
  const result = await probeMediaConnection({ ...DEFAULT_MEDIA_CONFIG, apiKey: "media-key" }, {
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(url), method: String(init?.method), authorization: headers.get("authorization") ?? undefined });
      return Response.json({ data: [{ id: "agnes-image-2.1-flash" }, { id: "agnes-video-v2.0" }] });
    },
  });
  assert.deepEqual(result, {
    kind: "ok",
    provider: "agnes",
    models: 2,
    baseUrl: "https://apihub.agnes-ai.com/v1",
  });
  assert.deepEqual(requests, [{
    url: "https://apihub.agnes-ai.com/v1/models",
    method: "GET",
    authorization: "Bearer media-key",
  }]);
});
