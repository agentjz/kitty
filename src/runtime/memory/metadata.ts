import type { RuntimeMemoryAssetKind, RuntimeMemoryAssetMetadata } from "./types.js";

const EVIDENCE_PREFIX = "evidence:";
const KIND_PREFIX = "kind:";
const SCOPE_PREFIX = "scope:";
const TAGS_PREFIX = "tags:";
const UPDATED_PREFIX = "updated:";

export interface ParsedRuntimeMemoryAssetMetadata extends RuntimeMemoryAssetMetadata {
  kind?: RuntimeMemoryAssetKind;
  updatedAt?: string;
  evidenceRefs: string[];
}

export function parseRuntimeMemoryAssetMetadata(
  body: string,
  fallback: {
    kind: RuntimeMemoryAssetKind;
    basename: string;
  },
): ParsedRuntimeMemoryAssetMetadata {
  const title = readTitle(body);
  const metadataLines = readMetadataLines(body);
  const kind = readKind(metadataLines, fallback.kind);
  const evidenceRefs = readEvidenceRefs(metadataLines, kind, fallback.basename);

  return {
    title,
    kind,
    updatedAt: readFirstMetadataValue(metadataLines, UPDATED_PREFIX),
    evidenceRefs,
    scope: readFirstMetadataValue(metadataLines, SCOPE_PREFIX),
    tags: readCsvMetadataValues(metadataLines, TAGS_PREFIX),
  };
}

export function renderRuntimeMemoryAssetDocument(input: {
  kind: RuntimeMemoryAssetKind;
  title: string;
  content: string;
  evidenceRefs?: string[];
  scope?: string;
  tags?: string[];
  timestamp: string;
}): string {
  return [
    `# ${input.title.trim()}`,
    "",
    `Kind: ${input.kind}`,
    `Updated: ${input.timestamp}`,
    renderOptionalLine("Evidence", normalizeList(input.evidenceRefs).join(", ")),
    renderOptionalLine("Scope", input.scope?.trim()),
    renderOptionalLine("Tags", normalizeList(input.tags).join(", ")),
    "",
    input.content.trim(),
    "",
  ].filter((line) => line !== undefined).join("\n");
}

function readTitle(body: string): string | undefined {
  const line = body.split(/\r?\n/).find((item) => item.trim().startsWith("# "));
  return line?.replace(/^#\s+/, "").trim() || undefined;
}

function readMetadataLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z][A-Za-z -]*:/.test(line));
}

function readKind(lines: string[], fallback: RuntimeMemoryAssetKind): RuntimeMemoryAssetKind {
  const value = readFirstMetadataValue(lines, KIND_PREFIX);
  return isRuntimeMemoryAssetKind(value) ? value : fallback;
}

function readEvidenceRefs(lines: string[], kind: RuntimeMemoryAssetKind, basename: string): string[] {
  const refs = lines
    .filter((line) => line.toLowerCase().startsWith(EVIDENCE_PREFIX))
    .flatMap((line) => line.slice(EVIDENCE_PREFIX.length).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (refs.length > 0) {
    return [...new Set(refs)];
  }
  return kind === "session" ? [`session:${basename}`] : [];
}

function readFirstMetadataValue(lines: string[], prefix: string): string | undefined {
  const line = lines.find((item) => item.toLowerCase().startsWith(prefix));
  const value = line?.slice(prefix.length).trim();
  return value || undefined;
}

function readCsvMetadataValues(lines: string[], prefix: string): string[] {
  return normalizeList(
    lines
      .filter((line) => line.toLowerCase().startsWith(prefix))
      .flatMap((line) => line.slice(prefix.length).split(",")),
  );
}

function normalizeList(values: Array<string | undefined> | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function renderOptionalLine(label: string, value: string | undefined): string | undefined {
  return value ? `${label}: ${value}` : undefined;
}

function isRuntimeMemoryAssetKind(value: string | undefined): value is RuntimeMemoryAssetKind {
  return value === "evidence" || value === "project" || value === "session" || value === "user";
}
