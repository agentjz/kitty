import fs from "node:fs/promises";
import path from "node:path";

import { ToolExecutionError } from "../../../../tools/core/errors.js";
import { toToolRelativePath } from "../../../../tools/core/pathDisplay.js";
import { okResult, parseArgs, readOptionalNumber, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { resolveUserPath } from "../../../../utils/fs.js";
import { extractDocumentRange } from "../extraction.js";

const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MAX_PDF_PAGES_PER_READ = 100;
const MAX_DOCX_BLOCKS_PER_READ = 500;

export const documentReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "document_read",
      description: "Read text from a DOCX or text-based PDF in bounded ranges. PDF units are pages; DOCX units are text blocks. Scanned PDFs require OCR, which this tool does not provide.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to a .docx or .pdf file." },
          start: { type: "number", description: "1-based page or block to start from. Defaults to 1." },
          limit: { type: "number", description: "Maximum pages or blocks to return. Defaults to 5 PDF pages or 50 DOCX blocks." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  effect: "read",
  parallelSafe: false,
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const resolved = resolveUserPath(targetPath, context.cwd);
    const displayPath = toToolRelativePath(context.cwd, resolved);
    const extension = path.extname(resolved).toLowerCase();
    const format = extension === ".pdf" ? "pdf" : extension === ".docx" ? "docx" : undefined;
    if (!format) {
      throw new ToolExecutionError(`document_read only supports .pdf and .docx files: ${targetPath}`, {
        code: "DOCUMENT_FORMAT_UNSUPPORTED",
        details: { path: targetPath, extension },
      });
    }

    const start = readOptionalNumber(args.start) ?? 1;
    const defaultLimit = format === "pdf" ? 5 : 50;
    const maximumLimit = format === "pdf" ? MAX_PDF_PAGES_PER_READ : MAX_DOCX_BLOCKS_PER_READ;
    const limit = readOptionalNumber(args.limit) ?? defaultLimit;
    if (start < 1 || limit < 1 || limit > maximumLimit) {
      throw new ToolExecutionError(`document_read requires start >= 1 and limit between 1 and ${maximumLimit}.`, {
        code: "DOCUMENT_RANGE_INVALID",
        details: { start, limit, maximumLimit },
      });
    }

    context.abortSignal?.throwIfAborted();
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      throw new ToolExecutionError(`Document path is not a file: ${targetPath}`, {
        code: "DOCUMENT_NOT_FILE",
        details: { path: targetPath },
      });
    }
    if (stat.size > MAX_DOCUMENT_BYTES) {
      throw new ToolExecutionError(`Document is too large (${stat.size} bytes; maximum ${MAX_DOCUMENT_BYTES}).`, {
        code: "DOCUMENT_TOO_LARGE",
        details: { path: targetPath, size: stat.size, maximumBytes: MAX_DOCUMENT_BYTES },
      });
    }

    let extracted;
    try {
      extracted = await extractDocumentRange({
        filePath: resolved,
        format,
        start,
        limit,
        abortSignal: context.abortSignal,
      });
    } catch (error) {
      if (context.abortSignal?.aborted) throw error;
      throw new ToolExecutionError(`Failed to read ${format.toUpperCase()} document: ${error instanceof Error ? error.message : String(error)}`, {
        code: "DOCUMENT_READ_FAILED",
        details: { path: targetPath, format },
      });
    }

    if (start > extracted.totalUnits) {
      throw new ToolExecutionError(`document_read start ${start} is beyond the document (${extracted.totalUnits} ${extracted.unit}s total).`, {
        code: "DOCUMENT_RANGE_INVALID",
        details: { start, totalUnits: extracted.totalUnits, unit: extracted.unit },
      });
    }
    if (extracted.units.length === 0 || extracted.units.every((unit) => unit.text.length === 0)) {
      throw new ToolExecutionError(
        format === "pdf"
          ? "No extractable text was found in the requested PDF pages. The pages may be scanned images; OCR is required."
          : "No extractable text was found in the DOCX document.",
        {
          code: format === "pdf" ? "OCR_REQUIRED" : "DOCUMENT_TEXT_EMPTY",
          details: { path: targetPath, start, limit },
        },
      );
    }

    const fitted = fitUnitsToBudget(extracted.units, extracted.unit, context.config.maxReadBytes);
    const endUnit = fitted.units.at(-1)?.number ?? start - 1;
    const truncated = endUnit < extracted.totalUnits;
    const warnings = [...extracted.warnings, ...fitted.warnings];
    await context.recordWorksetFile?.({
      path: resolved,
      toolName: "document_read",
      changed: false,
      reason: truncated ? "partial document read" : "document read",
    });

    return okResult(JSON.stringify({
      path: displayPath,
      absolutePath: resolved,
      format: extracted.format,
      unit: extracted.unit,
      size: stat.size,
      totalUnits: extracted.totalUnits,
      startUnit: start,
      endUnit,
      truncated,
      content: fitted.content,
      warnings,
      continuation: truncated
        ? {
            hasMore: true,
            nextStart: endUnit + 1,
            limit,
            continuationArgs: {
              path: displayPath,
              start: endUnit + 1,
              limit,
            },
          }
        : undefined,
    }, null, 2));
  },
};

function fitUnitsToBudget(
  units: Array<{ number: number; text: string }>,
  unit: "block" | "page",
  maxChars: number,
): { units: Array<{ number: number; text: string }>; content: string; warnings: string[] } {
  const selected: Array<{ number: number; text: string }> = [];
  let content = "";
  const warnings: string[] = [];

  for (const candidate of units) {
    const label = unit === "page" ? `Page ${candidate.number}` : `Block ${candidate.number}`;
    const section = `[${label}]\n${candidate.text}`;
    const next = content ? `${content}\n\n${section}` : section;
    if (next.length <= maxChars) {
      selected.push(candidate);
      content = next;
      continue;
    }
    if (selected.length === 0) {
      selected.push(candidate);
      content = section.slice(0, maxChars);
      warnings.push(`${label} exceeded the output budget and was truncated.`);
    }
    break;
  }

  return { units: selected, content, warnings };
}
