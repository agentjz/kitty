import fs from "node:fs/promises";

import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ExtractedDocumentRange {
  format: "docx" | "pdf";
  unit: "block" | "page";
  totalUnits: number;
  units: Array<{ number: number; text: string }>;
  warnings: string[];
}

export async function extractDocumentRange(input: {
  filePath: string;
  format: "docx" | "pdf";
  start: number;
  limit: number;
  abortSignal?: AbortSignal;
}): Promise<ExtractedDocumentRange> {
  throwIfAborted(input.abortSignal);
  return input.format === "docx"
    ? extractDocxRange(input)
    : extractPdfRange(input);
}

async function extractDocxRange(input: {
  filePath: string;
  start: number;
  limit: number;
  abortSignal?: AbortSignal;
}): Promise<ExtractedDocumentRange> {
  const result = await mammoth.extractRawText({ path: input.filePath });
  throwIfAborted(input.abortSignal);
  const blocks = result.value
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const startIndex = input.start - 1;

  return {
    format: "docx",
    unit: "block",
    totalUnits: blocks.length,
    units: blocks.slice(startIndex, startIndex + input.limit).map((text, index) => ({
      number: input.start + index,
      text,
    })),
    warnings: result.messages
      .filter((message) => message.type === "warning")
      .map((message) => message.message),
  };
}

async function extractPdfRange(input: {
  filePath: string;
  start: number;
  limit: number;
  abortSignal?: AbortSignal;
}): Promise<ExtractedDocumentRange> {
  const data = new Uint8Array(await fs.readFile(input.filePath));
  throwIfAborted(input.abortSignal);
  const loadingTask = getDocument({
    data,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;

  try {
    const end = Math.min(pdf.numPages, input.start + input.limit - 1);
    const units: Array<{ number: number; text: string }> = [];
    for (let pageNumber = input.start; pageNumber <= end; pageNumber += 1) {
      throwIfAborted(input.abortSignal);
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => {
          if (!("str" in item)) {
            return "";
          }
          return `${item.str}${item.hasEOL ? "\n" : " "}`;
        })
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      units.push({ number: pageNumber, text });
      page.cleanup();
    }
    throwIfAborted(input.abortSignal);

    return {
      format: "pdf",
      unit: "page",
      totalUnits: pdf.numPages,
      units,
      warnings: [],
    };
  } finally {
    await loadingTask.destroy();
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}
