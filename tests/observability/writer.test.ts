import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { appendObservabilityEvent, getObservabilityPaths } from "../../src/observability/writer.js";
import { createTempWorkspace } from "../helpers.js";

test("observability writes jsonl side-channel events", async (t) => {
  const root = await createTempWorkspace("observability", t);
  const record = await appendObservabilityEvent(root, {
    event: "host.turn.started",
    status: "started",
    details: { host: "test" },
  });
  const paths = getObservabilityPaths(root);
  const filePath = path.join(paths.observabilityEventsDir, `${record.timestamp.slice(0, 10)}.jsonl`);
  const content = await fs.readFile(filePath, "utf8");

  assert.match(content, /host\.turn\.started/);
});

test("observability persists model request usage details", async (t) => {
  const root = await createTempWorkspace("observability-usage", t);
  const record = await appendObservabilityEvent(root, {
    event: "model.request",
    status: "completed",
    model: "gpt-5.5",
    details: {
      provider: "openai",
      usageAvailable: true,
      usage: {
        inputTokens: 100,
        cacheReadTokens: 80,
      },
    },
  });
  const paths = getObservabilityPaths(root);
  const filePath = path.join(paths.observabilityEventsDir, `${record.timestamp.slice(0, 10)}.jsonl`);
  const content = await fs.readFile(filePath, "utf8");

  assert.match(content, /cacheReadTokens/);
  assert.match(content, /usageAvailable/);
});
