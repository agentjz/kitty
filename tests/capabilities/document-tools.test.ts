import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createDocumentTools } from "../../src/capabilities/tools/documents/index.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

test("documents capability exposes bounded read and tracked Word write tools", () => {
  const tools = createDocumentTools();
  assert.deepEqual(tools.map((tool) => tool.definition.function.name), ["document_read", "document_write"]);
  assert.deepEqual(tools.map((tool) => tool.effect), ["read", "write"]);
  assert.deepEqual(tools.map((tool) => tool.parallelSafe), [false, false]);
  assert.equal(tools[1]?.changeSignal, "required");
});

test("document_write creates a real DOCX and document_read extracts its content", async (t) => {
  const root = await createTempWorkspace("document-roundtrip", t);
  const context = createToolContext(root);
  const workset: Array<{ toolName: string; changed: boolean }> = [];
  context.recordWorksetFile = async (input) => {
    workset.push({ toolName: input.toolName, changed: input.changed });
  };
  const tools = createDocumentTools();
  const write = tools[1]!;
  const read = tools[0]!;
  const target = path.join(root, "reports", "acceptance.docx");

  const written = await write.execute(JSON.stringify({
    path: target,
    title: "Kitty document acceptance",
    content: "# Findings\nRound-trip sentinel\n- first item\n- second item",
  }), context);
  const writePayload = parseToolJson(written.output);
  const bytes = await fs.readFile(target);

  assert.equal(written.ok, true);
  assert.equal(bytes.subarray(0, 2).toString("ascii"), "PK");
  assert.equal(writePayload.existed, false);
  assert.equal(typeof writePayload.changeId, "string");
  assert.deepEqual(written.metadata?.changedPaths, [target]);

  const readResult = await read.execute(JSON.stringify({ path: target, start: 1, limit: 20 }), context);
  const readPayload = parseToolJson(readResult.output);
  assert.equal(readPayload.format, "docx");
  assert.equal(readPayload.unit, "block");
  assert.match(String(readPayload.content), /Kitty document acceptance/);
  assert.match(String(readPayload.content), /Round-trip sentinel/);
  assert.match(String(readPayload.content), /first item/);
  assert.deepEqual(workset, [
    { toolName: "document_write", changed: true },
    { toolName: "document_read", changed: false },
  ]);
});

test("document_write records binary snapshots and undo restores the prior DOCX", async (t) => {
  const root = await createTempWorkspace("document-undo", t);
  const context = createToolContext(root);
  const write = createDocumentTools()[1]!;
  const target = path.join(root, "undo.docx");

  await write.execute(JSON.stringify({ path: target, content: "BEFORE_SENTINEL" }), context);
  const before = await fs.readFile(target);
  const overwritten = parseToolJson((await write.execute(JSON.stringify({
    path: target,
    content: "AFTER_SENTINEL",
  }), context)).output);

  assert.equal(overwritten.existed, true);
  assert.notEqual(Buffer.compare(before, await fs.readFile(target)), 0);
  const changeId = String(overwritten.changeId);
  const record = await context.changeStore.load(changeId);
  assert.equal(record.operations[0]?.binary, true);
  assert.equal(record.operations[0]?.beforeBytes, before.byteLength);

  await context.changeStore.undo(changeId);
  assert.equal(Buffer.compare(before, await fs.readFile(target)), 0);
});

test("aborted document calls stop before parsing or writing side effects", async (t) => {
  const root = await createTempWorkspace("document-abort", t);
  const context = createToolContext(root);
  const controller = new AbortController();
  controller.abort();
  context.abortSignal = controller.signal;
  const tools = createDocumentTools();
  const read = tools[0]!;
  const write = tools[1]!;
  const pdfPath = path.join(root, "source.pdf");
  const docxPath = path.join(root, "must-not-exist.docx");
  await fs.writeFile(pdfPath, createSimplePdf(["ABORT_SENTINEL"]));

  await assert.rejects(() => read.execute(JSON.stringify({ path: pdfPath }), context), { name: "AbortError" });
  await assert.rejects(() => write.execute(JSON.stringify({
    path: docxPath,
    content: "must not be written",
  }), context), { name: "AbortError" });
  await assert.rejects(() => fs.access(docxPath), { code: "ENOENT" });
});

test("document_read reads PDF pages with continuation and rejects empty image-only ranges", async (t) => {
  const root = await createTempWorkspace("document-pdf", t);
  const context = createToolContext(root);
  const read = createDocumentTools()[0]!;
  const pdfPath = path.join(root, "two-pages.pdf");
  await fs.writeFile(pdfPath, createSimplePdf(["PDF_PAGE_ONE", "PDF_PAGE_TWO"]));

  const first = parseToolJson((await read.execute(JSON.stringify({
    path: pdfPath,
    start: 1,
    limit: 1,
  }), context)).output);
  assert.equal(first.format, "pdf");
  assert.equal(first.totalUnits, 2);
  assert.equal(first.endUnit, 1);
  assert.equal(first.truncated, true);
  assert.match(String(first.content), /PDF_PAGE_ONE/);
  assert.deepEqual((first.continuation as Record<string, unknown>).continuationArgs, {
    path: "two-pages.pdf",
    start: 2,
    limit: 1,
  });

  const second = parseToolJson((await read.execute(JSON.stringify({
    path: pdfPath,
    start: 2,
    limit: 1,
  }), context)).output);
  assert.match(String(second.content), /PDF_PAGE_TWO/);
  assert.equal(second.truncated, false);

  const emptyPdfPath = path.join(root, "empty.pdf");
  await fs.writeFile(emptyPdfPath, createSimplePdf([""]));
  await assert.rejects(
    () => read.execute(JSON.stringify({ path: emptyPdfPath }), context),
    (error: unknown) => error instanceof Error
      && error.message.includes("OCR is required")
      && "code" in error
      && error.code === "OCR_REQUIRED",
  );
});

function createSimplePdf(pageTexts: string[]): Buffer {
  const pageObjectNumbers = pageTexts.map((_, index) => 3 + index * 2);
  const contentObjectNumbers = pageTexts.map((_, index) => 4 + index * 2);
  const fontObjectNumber = 3 + pageTexts.length * 2;
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2, `<< /Type /Pages /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`);
  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageObject = pageObjectNumbers[index]!;
    const contentObject = contentObjectNumbers[index]!;
    const text = pageTexts[index]!.replace(/([\\()])/g, "\\$1");
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
    objects.set(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.set(contentObject, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects.set(fontObjectNumber, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let number = 1; number <= fontObjectNumber; number += 1) {
    offsets[number] = Buffer.byteLength(body);
    body += `${number} 0 obj\n${objects.get(number)}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${fontObjectNumber + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let number = 1; number <= fontObjectNumber; number += 1) {
    body += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${fontObjectNumber + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}
