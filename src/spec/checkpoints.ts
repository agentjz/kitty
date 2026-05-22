import fs from "node:fs/promises";
import path from "node:path";

import { compactSpecTimestamp } from "./format.js";
import { getSpecPaths, sanitizeSpecIdPart } from "./layout.js";
import { normalizeSpecCheckpoint, normalizeSpecState, SPEC_DOCUMENT_NAMES } from "./schema.js";
import {
  assertSpecWorkspaceCheckpointRestorable,
  createSpecWorkspaceCheckpoint,
  restoreSpecWorkspaceCheckpoint,
} from "./workspace.js";
import type { SpecCheckpointRecord, SpecState } from "./types.js";

export class SpecCheckpointStore {
  constructor(
    private readonly stateRootDir: string,
    private readonly requireRootDir: (action: string) => string,
    private readonly loadState: (id: string) => Promise<SpecState>,
    private readonly saveState: (state: SpecState) => Promise<void>,
    private readonly readDocument: (id: string, document: typeof SPEC_DOCUMENT_NAMES[number]) => Promise<string>,
  ) {}

  async create(id: string, input: {
    label: string;
    reason?: string;
  }): Promise<SpecCheckpointRecord> {
    const state = await this.loadState(id);
    const createdAt = new Date().toISOString();
    const checkpoint: SpecCheckpointRecord = {
      id: `${compactSpecTimestamp(createdAt)}-${sanitizeSpecIdPart(input.label).slice(0, 32)}`,
      label: input.label.trim() || "checkpoint",
      reason: input.reason?.trim() || undefined,
      createdAt,
      stage: state.stage,
      status: state.status,
    };
    if (state.workspace) {
      checkpoint.workspace = await createSpecWorkspaceCheckpoint({
        workspace: state.workspace,
        specId: id,
        checkpointId: checkpoint.id,
        label: checkpoint.label,
      });
    }
    const paths = getSpecPaths(this.stateRootDir, id);
    const dir = path.join(paths.checkpointsDir, checkpoint.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "checkpoint.json"), `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
    for (const document of SPEC_DOCUMENT_NAMES) {
      const content = await this.readDocument(id, document).catch(() => "");
      await fs.writeFile(path.join(dir, `${document}.md`), content, "utf8");
    }
    await this.saveState({
      ...state,
      currentCheckpointId: checkpoint.id,
      updatedAt: createdAt,
    });
    return checkpoint;
  }

  async list(id: string): Promise<SpecCheckpointRecord[]> {
    const dir = getSpecPaths(this.stateRootDir, id).checkpointsDir;
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const checkpoints = await Promise.all(entries.map(async (entry) => {
      try {
        const raw = await fs.readFile(path.join(dir, entry, "checkpoint.json"), "utf8");
        return normalizeSpecCheckpoint(JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    }));
    return checkpoints
      .filter((item): item is SpecCheckpointRecord => Boolean(item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async restore(id: string, checkpointId: string): Promise<SpecState> {
    const paths = getSpecPaths(this.stateRootDir, id);
    const dir = path.join(paths.checkpointsDir, checkpointId);
    const raw = await fs.readFile(path.join(dir, "state.json"), "utf8");
    const checkpoint = await fs.readFile(path.join(dir, "checkpoint.json"), "utf8")
      .then((value) => normalizeSpecCheckpoint(JSON.parse(value) as unknown));
    const restored = normalizeSpecState(JSON.parse(raw) as unknown);
    if (restored.workspace && checkpoint.workspace) {
      await assertSpecWorkspaceCheckpointRestorable({
        rootDir: this.requireRootDir("restore a spec workspace checkpoint"),
        stateRootDir: this.stateRootDir,
        workspace: restored.workspace,
      });
    }
    const now = new Date().toISOString();
    const next: SpecState = {
      ...restored,
      updatedAt: now,
      currentCheckpointId: checkpoint.id,
      metadata: {
        ...restored.metadata,
        restoredFromCheckpoint: checkpoint.id,
        restoredAt: now,
      },
    };
    await this.saveState(next);
    for (const document of SPEC_DOCUMENT_NAMES) {
      const source = path.join(dir, `${document}.md`);
      const content = await fs.readFile(source, "utf8").catch(() => "");
      await fs.writeFile(paths.documents[document], content, "utf8");
    }
    if (next.workspace && checkpoint.workspace) {
      await restoreSpecWorkspaceCheckpoint({
        rootDir: this.requireRootDir("restore a spec workspace checkpoint"),
        stateRootDir: this.stateRootDir,
        workspace: next.workspace,
        checkpoint: checkpoint.workspace,
      });
    }
    return next;
  }
}
