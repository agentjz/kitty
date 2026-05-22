import fs from "node:fs/promises";

import { summarizeSpec } from "./format.js";
import { getSpecPaths } from "./layout.js";
import {
  appendSpecNote,
  ensureSpecDocuments,
  readAllSpecDocuments,
  readSpecDocument,
  writeSpecDocument,
} from "./documents.js";
import { SpecCheckpointStore } from "./checkpoints.js";
import { SpecSessionBindingStore } from "./sessionBinding.js";
import { SpecStateStore, type SpecStatePatch } from "./stateStore.js";
import { ensureSpecWorkspace } from "./workspace.js";
import type {
  SpecCheckpointRecord,
  SpecDocumentName,
  SpecSessionBinding,
  SpecState,
  SpecSummary,
  SpecTaskStatus,
} from "./types.js";

export { summarizeSpec } from "./format.js";

export class SpecStore {
  private readonly states: SpecStateStore;
  private readonly sessionBindings: SpecSessionBindingStore;
  private readonly checkpoints: SpecCheckpointStore;

  constructor(
    private readonly stateRootDir: string,
    private readonly options: {
      rootDir?: string;
    } = {},
  ) {
    this.states = new SpecStateStore(stateRootDir);
    this.sessionBindings = new SpecSessionBindingStore(stateRootDir);
    this.checkpoints = new SpecCheckpointStore(
      stateRootDir,
      (action) => this.requireRootDir(action),
      (id) => this.load(id),
      (state) => this.states.save(state),
      (id, document) => this.readDocument(id, document),
    );
  }

  async create(input: {
    title: string;
    summary?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SpecState> {
    const id = await this.states.createUniqueSpecId(input.title);
    const workspace = await ensureSpecWorkspace({
      rootDir: this.requireRootDir("create a spec workspace"),
      stateRootDir: this.stateRootDir,
      specId: id,
    });
    const state = await this.states.createInitial({
      ...input,
      id,
      workspace,
    });
    await fs.mkdir(getSpecPaths(this.stateRootDir, state.id).checkpointsDir, { recursive: true });
    await fs.mkdir(getSpecPaths(this.stateRootDir, state.id).artifactsDir, { recursive: true });
    await ensureSpecDocuments(this.stateRootDir, state.id);
    if (input.sessionId) {
      await this.bindSession(input.sessionId, state.id);
    }
    await this.createCheckpoint(state.id, {
      label: "spec created",
      reason: "Initial durable spec state.",
    });
    return this.load(state.id);
  }

  async load(id: string): Promise<SpecState> {
    return this.states.load(id);
  }

  async list(limit = 20): Promise<SpecSummary[]> {
    return this.states.list(limit);
  }

  async search(query: string, limit = 20): Promise<SpecSummary[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
    const specs = await this.list(100);
    if (terms.length === 0) {
      return specs.slice(0, limit);
    }

    const scored = await Promise.all(specs.map(async (summary) => {
      const docs = await this.readAllDocuments(summary.id).catch(() => ({} as Record<string, string>));
      const haystack = [
        summary.id,
        summary.title,
        summary.summary ?? "",
        Object.values(docs).join("\n"),
      ].join("\n").toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { summary, score };
    }));

    return scored
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || right.summary.updatedAt.localeCompare(left.summary.updatedAt))
      .slice(0, Math.max(1, Math.min(50, Math.trunc(limit))))
      .map((entry) => entry.summary);
  }

  async updateState(id: string, patch: SpecStatePatch): Promise<SpecState> {
    return this.states.update(id, patch);
  }

  async bindSession(sessionId: string, specId: string): Promise<SpecSessionBinding> {
    const binding = await this.sessionBindings.bind(sessionId, specId);
    await this.states.addSession(specId, sessionId).catch(() => undefined);
    return binding;
  }

  async loadSessionBinding(sessionId: string): Promise<SpecSessionBinding | null> {
    return this.sessionBindings.load(sessionId);
  }

  async writeDocument(id: string, document: SpecDocumentName, content: string): Promise<{
    state: SpecState;
    path: string;
  }> {
    const file = await writeSpecDocument({
      stateRootDir: this.stateRootDir,
      id,
      document,
      content,
    });
    const state = await this.updateState(id, {});
    return { state, path: file };
  }

  async appendNote(id: string, input: {
    heading?: string;
    content: string;
  }): Promise<{
    state: SpecState;
    path: string;
  }> {
    const file = await appendSpecNote({
      stateRootDir: this.stateRootDir,
      id,
      ...input,
    });
    const state = await this.updateState(id, {});
    return { state, path: file };
  }

  async readDocument(id: string, document: SpecDocumentName): Promise<string> {
    return readSpecDocument(this.stateRootDir, id, document);
  }

  async readAllDocuments(id: string): Promise<Record<SpecDocumentName, string>> {
    return readAllSpecDocuments(this.stateRootDir, id);
  }

  async updateTask(id: string, taskId: string, patch: {
    title?: string;
    status: SpecTaskStatus;
    evidence?: string;
  }): Promise<SpecState> {
    return this.states.updateTask(id, taskId, patch);
  }

  async createCheckpoint(id: string, input: {
    label: string;
    reason?: string;
  }): Promise<SpecCheckpointRecord> {
    return this.checkpoints.create(id, input);
  }

  async listCheckpoints(id: string): Promise<SpecCheckpointRecord[]> {
    return this.checkpoints.list(id);
  }

  async restoreCheckpoint(id: string, checkpointId: string): Promise<SpecState> {
    return this.checkpoints.restore(id, checkpointId);
  }

  private requireRootDir(action: string): string {
    if (!this.options.rootDir) {
      throw new Error(`SpecStore requires rootDir to ${action}.`);
    }
    return this.options.rootDir;
  }
}
