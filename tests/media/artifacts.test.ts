import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { inspectMediaArtifact, resolveMediaOutputPath, writeMediaArtifact } from "../../src/media/artifacts.js";
import { createTempWorkspace } from "../helpers.js";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const MP4 = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]);

test("media artifacts recognize exact image and video signatures", () => {
  assert.deepEqual(inspectMediaArtifact(PNG, "image"), { extension: ".png", mimeType: "image/png" });
  assert.deepEqual(inspectMediaArtifact(MP4, "video"), { extension: ".mp4", mimeType: "video/mp4" });
  assert.throws(() => inspectMediaArtifact(Buffer.from("RIFF-not-webp"), "image"), /not a recognized/iu);
  assert.throws(() => inspectMediaArtifact(Buffer.from("not-video"), "video"), /not a recognized/iu);
});

test("media output cannot escape the project boundary", async (t) => {
  const root = await createTempWorkspace("media-boundary", t);
  assert.throws(() => resolveMediaOutputPath(root, path.join("..", "outside.png"), ".png"), /inside the project/iu);
});

test("media artifact writes atomically and removes temporary files on rename failure", async (t) => {
  const root = await createTempWorkspace("media-atomic", t);
  const target = path.join(root, "generated", "image.png");
  await writeMediaArtifact(target, PNG, "image");
  assert.deepEqual(await fs.readFile(target), PNG);

  const directoryTarget = path.join(root, "generated", "occupied");
  await fs.mkdir(directoryTarget);
  await assert.rejects(() => writeMediaArtifact(directoryTarget, PNG, "image"));
  const names = await fs.readdir(path.dirname(directoryTarget));
  assert.equal(names.some((name) => name.includes("occupied") && name.endsWith(".tmp")), false);
});
