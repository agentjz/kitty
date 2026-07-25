import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";
import { atomicWriteFile } from "../utils/fs.js";

export interface PersistedCapabilityEvidence {
  absolutePath: string;
  relativePath: string;
  bytes: number;
  truncated: boolean;
}

export async function persistCapabilityEvidence(input: {
  rootDir: string;
  capabilityId: string;
  operationId: string;
  value: unknown;
  retained?: Readonly<Record<string, unknown>>;
  maxBytes: number;
}): Promise<PersistedCapabilityEvidence> {
  const paths = getProjectStatePaths(input.rootDir);
  const evidenceDir = path.join(paths.capabilitiesDir, input.capabilityId, "evidence");
  await fs.mkdir(evidenceDir, { recursive: true });
  const absolutePath = path.join(evidenceDir, `${sanitizeSegment(input.operationId)}.json`);
  const source = `${JSON.stringify(input.value, null, 2)}\n`;
  const sourceBytes = Buffer.byteLength(source, "utf8");
  const truncated = sourceBytes > input.maxBytes;
  const payload = truncated
    ? buildBoundedPayload(source, sourceBytes, input.maxBytes, input.retained)
    : source;
  await atomicWriteFile(absolutePath, payload);
  return {
    absolutePath,
    relativePath: path.relative(input.rootDir, absolutePath).replace(/\\/g, "/"),
    bytes: Buffer.byteLength(payload, "utf8"),
    truncated,
  };
}

function buildBoundedPayload(
  source: string,
  originalBytes: number,
  maxBytes: number,
  retained: Readonly<Record<string, unknown>> = {},
): string {
  const buffer = Buffer.from(source, "utf8");
  let low = 0;
  let high = buffer.length;
  let best = "";
  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = `${JSON.stringify({
      ...retained,
      truncated: true,
      originalBytes,
      boundedPayload: buffer.subarray(0, midpoint).toString("utf8"),
    }, null, 2)}\n`;
    if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
      best = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }
  if (!best) throw new Error(`Capability evidence limit ${maxBytes} is too small for truncation metadata.`);
  return best;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
