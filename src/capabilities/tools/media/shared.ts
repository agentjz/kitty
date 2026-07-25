import fs from "node:fs/promises";

import { writeMediaArtifact } from "../../../media/artifacts.js";
import { recordToolChange } from "../../../tools/core/changeTracking.js";
import type { ToolContext } from "../../../tools/core/types.js";
import { fileExists } from "../../../utils/fs.js";

export async function saveGeneratedMedia(input: {
  context: ToolContext;
  toolName: "generate_image" | "generate_video";
  outputPath: string;
  bytes: Buffer;
  kind: "image" | "video";
}): Promise<{ bytes: number; mimeType: string; changeId?: string; changeHistoryWarning?: string }> {
  input.context.abortSignal?.throwIfAborted();
  const existed = await fileExists(input.outputPath);
  const before = existed ? await fs.readFile(input.outputPath) : undefined;
  const artifact = await writeMediaArtifact(input.outputPath, input.bytes, input.kind);
  const preview = `${existed ? "Replace" : "Create"} generated ${input.kind} ${input.outputPath} (${artifact.bytes} bytes)`;
  const changeRecord = await recordToolChange(input.context, {
    toolName: input.toolName,
    summary: `${existed ? "replace" : "create"} generated ${input.kind}`,
    preview,
    operations: [{
      path: input.outputPath,
      kind: existed ? "update" : "create",
      binary: true,
      preview,
      beforeData: before,
      afterData: input.bytes,
    }],
  });
  await input.context.recordWorksetFile?.({
    path: input.outputPath,
    toolName: input.toolName,
    changed: true,
    changeId: changeRecord.change?.id,
    reason: `generated ${input.kind} artifact`,
  });
  return {
    ...artifact,
    changeId: changeRecord.change?.id,
    changeHistoryWarning: changeRecord.warning,
  };
}
