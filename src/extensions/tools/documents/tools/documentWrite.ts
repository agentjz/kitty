import fs from "node:fs/promises";
import path from "node:path";

import { recordToolChange } from "../../../../tools/core/changeTracking.js";
import { toToolRelativePath } from "../../../../tools/core/pathDisplay.js";
import { okResult, parseArgs, readBoolean, readPossiblyEmptyString, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { atomicWriteFile, ensureParentDirectory, fileExists, resolveUserPath, sha256Content } from "../../../../utils/fs.js";
import { createWordDocument } from "../wordWriter.js";

const MAX_DOCUMENT_SOURCE_CHARS = 5_000_000;

export const documentWriteTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "document_write",
      description: "Create or replace a Word .docx document from plain text or simple Markdown headings and bullets.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Target .docx path." },
          title: { type: "string", description: "Optional document title." },
          content: { type: "string", description: "Plain text or simple Markdown using # headings and - bullets." },
          create_directories: { type: "boolean", description: "Create missing parent directories. Defaults to true." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  effect: "write",
  parallelSafe: false,
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const content = readPossiblyEmptyString(args.content, "content");
    const title = typeof args.title === "string" ? args.title : undefined;
    const createDirectories = readBoolean(args.create_directories, true);
    const resolved = resolveUserPath(targetPath, context.cwd);
    const displayPath = toToolRelativePath(context.cwd, resolved);
    if (path.extname(resolved).toLowerCase() !== ".docx") {
      throw new Error(`document_write only supports .docx files: ${targetPath}`);
    }
    if (content.length + (title?.length ?? 0) > MAX_DOCUMENT_SOURCE_CHARS) {
      throw new Error(`document_write source exceeds ${MAX_DOCUMENT_SOURCE_CHARS} characters.`);
    }

    context.abortSignal?.throwIfAborted();
    const existed = await fileExists(resolved);
    const before = existed ? await fs.readFile(resolved) : undefined;
    const beforeHash = before ? sha256Content(before) : undefined;
    const after = await createWordDocument({ title, content });
    context.abortSignal?.throwIfAborted();
    const afterHash = sha256Content(after);

    if (createDirectories) {
      await ensureParentDirectory(resolved);
    }
    await atomicWriteFile(resolved, after);
    const preview = `${existed ? "Replace" : "Create"} Word document ${displayPath} (${after.byteLength} bytes)`;
    const changeRecord = await recordToolChange(context, {
      toolName: "document_write",
      summary: `${existed ? "write" : "create"} ${displayPath}`,
      preview,
      operations: [{
        path: resolved,
        kind: existed ? "update" : "create",
        binary: true,
        preview,
        beforeData: before,
        afterData: after,
      }],
    });
    await context.recordWorksetFile?.({
      path: resolved,
      toolName: "document_write",
      changed: true,
      changeId: changeRecord.change?.id,
      reason: existed ? "Word document replaced" : "Word document created",
    });

    return okResult(JSON.stringify({
      path: displayPath,
      absolutePath: resolved,
      format: "docx",
      existed,
      bytes: after.byteLength,
      beforeHash,
      afterHash,
      summary: preview,
      changedPaths: [displayPath],
      changeId: changeRecord.change?.id,
      changeHistoryWarning: changeRecord.warning,
    }, null, 2), {
      changedPaths: [resolved],
      changeId: changeRecord.change?.id,
    });
  },
};
