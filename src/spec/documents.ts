import fs from "node:fs/promises";

import { decodeTextBuffer } from "../utils/text.js";
import { normalizeSpecMarkdown } from "./format.js";
import { createInitialSpecDocument } from "./initialDocuments.js";
import { getSpecPaths } from "./layout.js";
import { assertSpecDocumentName, SPEC_DOCUMENT_NAMES } from "./schema.js";
import type { SpecDocumentName } from "./types.js";

export async function ensureSpecDocuments(stateRootDir: string, id: string): Promise<void> {
  const paths = getSpecPaths(stateRootDir, id);
  for (const document of SPEC_DOCUMENT_NAMES) {
    await fs.writeFile(paths.documents[document], createInitialSpecDocument(document), {
      encoding: "utf8",
      flag: "wx",
    }).catch(async (error: unknown) => {
      if (isFileExistsError(error)) {
        return;
      }
      throw error;
    });
  }
}

export async function writeSpecDocument(input: {
  stateRootDir: string;
  id: string;
  document: SpecDocumentName;
  content: string;
}): Promise<string> {
  assertSpecDocumentName(input.document);
  const paths = getSpecPaths(input.stateRootDir, input.id);
  await fs.mkdir(paths.specDir, { recursive: true });
  await fs.writeFile(paths.documents[input.document], normalizeSpecMarkdown(input.content), "utf8");
  return paths.documents[input.document];
}

export async function appendSpecNote(input: {
  stateRootDir: string;
  id: string;
  heading?: string;
  content: string;
}): Promise<string> {
  const paths = getSpecPaths(input.stateRootDir, input.id);
  await fs.mkdir(paths.specDir, { recursive: true });
  const current = await readSpecDocument(input.stateRootDir, input.id, "notes").catch(() => "");
  const timestamp = new Date().toISOString();
  const heading = input.heading?.trim() || "Spec note";
  const content = normalizeSpecMarkdown(input.content);
  const entry = [
    `## ${heading}`,
    "",
    `Recorded: ${timestamp}`,
    "",
    content,
    "",
  ].join("\n");
  const nextContent = current.trim()
    ? `${current.trimEnd()}\n\n${entry}`
    : `# Notes\n\n${entry}`;
  await fs.writeFile(paths.documents.notes, normalizeSpecMarkdown(nextContent), "utf8");
  return paths.documents.notes;
}

export async function readSpecDocument(
  stateRootDir: string,
  id: string,
  document: SpecDocumentName,
): Promise<string> {
  assertSpecDocumentName(document);
  const file = getSpecPaths(stateRootDir, id).documents[document];
  const buffer = await fs.readFile(file);
  const decoded = decodeTextBuffer(buffer);
  if (!decoded) {
    throw new Error(`Spec document is not readable UTF-8 text: ${file}`);
  }
  return decoded.text;
}

export async function readAllSpecDocuments(stateRootDir: string, id: string): Promise<Record<SpecDocumentName, string>> {
  const result = {} as Record<SpecDocumentName, string>;
  for (const document of SPEC_DOCUMENT_NAMES) {
    result[document] = await readSpecDocument(stateRootDir, id, document).catch(() => "");
  }
  return result;
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
