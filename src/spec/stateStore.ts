import fs from "node:fs/promises";
import path from "node:path";

import { compactSpecTimestamp, summarizeSpec } from "./format.js";
import { getSpecPaths, getSpecRootDir, sanitizeSpecIdPart } from "./layout.js";
import {
  assertSpecStage,
  assertSpecStatus,
  assertSpecTaskStatus,
  normalizeSpecState,
} from "./schema.js";
import type {
  SpecStage,
  SpecState,
  SpecStatus,
  SpecSummary,
  SpecTaskStatus,
} from "./types.js";

export interface SpecStatePatch {
  title?: string;
  summary?: string;
  stage?: SpecStage;
  status?: SpecStatus;
  confirmed?: Partial<SpecState["confirmed"]>;
  metadata?: Record<string, unknown>;
  sessionId?: string;
}

export class SpecStateStore {
  constructor(private readonly stateRootDir: string) {}

  async createInitial(input: {
    id: string;
    title: string;
    summary?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
    workspace?: SpecState["workspace"];
  }): Promise<SpecState> {
    const now = new Date().toISOString();
    const state: SpecState = {
      schemaVersion: 1,
      id: input.id,
      title: input.title.trim() || input.id,
      summary: input.summary?.trim() || undefined,
      stage: "requirements",
      status: "active",
      createdAt: now,
      updatedAt: now,
      sessionIds: input.sessionId ? [input.sessionId] : [],
      confirmed: {
        requirements: false,
        design: false,
        tasks: false,
      },
      tasks: {},
      workspace: input.workspace,
      metadata: input.metadata ?? {},
    };
    await this.save(state);
    return state;
  }

  async load(id: string): Promise<SpecState> {
    const paths = getSpecPaths(this.stateRootDir, id);
    const raw = await fs.readFile(paths.stateFile, "utf8");
    return normalizeSpecState(JSON.parse(raw) as unknown);
  }

  async list(limit = 20): Promise<SpecSummary[]> {
    const changesDir = path.join(getSpecRootDir(this.stateRootDir), "changes");
    let entries: string[];
    try {
      entries = await fs.readdir(changesDir);
    } catch {
      return [];
    }

    const states = await Promise.all(entries.map(async (entry) => {
      try {
        return await this.load(entry);
      } catch {
        return null;
      }
    }));

    return states
      .filter((state): state is SpecState => Boolean(state))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map(summarizeSpec);
  }

  async update(id: string, patch: SpecStatePatch): Promise<SpecState> {
    const current = await this.load(id);
    const now = new Date().toISOString();
    const next: SpecState = {
      ...current,
      title: patch.title?.trim() || current.title,
      summary: patch.summary !== undefined ? patch.summary.trim() || undefined : current.summary,
      stage: patch.stage ?? current.stage,
      status: patch.status ?? current.status,
      updatedAt: now,
      confirmed: {
        ...current.confirmed,
        ...(patch.confirmed ?? {}),
      },
      metadata: {
        ...current.metadata,
        ...(patch.metadata ?? {}),
      },
      sessionIds: patch.sessionId && !current.sessionIds.includes(patch.sessionId)
        ? [...current.sessionIds, patch.sessionId]
        : current.sessionIds,
    };
    await this.save(next);
    return next;
  }

  async updateTask(id: string, taskId: string, patch: {
    title?: string;
    status: SpecTaskStatus;
    evidence?: string;
  }): Promise<SpecState> {
    assertSpecTaskStatus(patch.status);
    const current = await this.load(id);
    const now = new Date().toISOString();
    const next: SpecState = {
      ...current,
      updatedAt: now,
      tasks: {
        ...current.tasks,
        [taskId]: {
          id: taskId,
          title: patch.title ?? current.tasks[taskId]?.title,
          status: patch.status,
          evidence: patch.evidence ?? current.tasks[taskId]?.evidence,
          updatedAt: now,
        },
      },
    };
    await this.save(next);
    return next;
  }

  async addSession(specId: string, sessionId: string): Promise<void> {
    const current = await this.load(specId);
    if (current.sessionIds.includes(sessionId)) {
      return;
    }
    await this.save({
      ...current,
      sessionIds: [...current.sessionIds, sessionId],
      updatedAt: new Date().toISOString(),
    });
  }

  async save(state: SpecState): Promise<void> {
    assertSpecStage(state.stage);
    assertSpecStatus(state.status);
    const paths = getSpecPaths(this.stateRootDir, state.id);
    await fs.mkdir(paths.specDir, { recursive: true });
    await fs.writeFile(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async createUniqueSpecId(title: string, createdAt = new Date().toISOString()): Promise<string> {
    const base = `${compactSpecTimestamp(createdAt)}-${sanitizeSpecIdPart(title)}`;
    let id = base;
    for (let index = 2; ; index += 1) {
      try {
        await fs.access(getSpecPaths(this.stateRootDir, id).stateFile);
        id = `${base}-${index}`;
      } catch {
        return id;
      }
    }
  }
}
