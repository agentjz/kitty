import { buildRuntimeStatus } from "../runtime/status.js";
import { SessionEventStore, type SessionEventRecord } from "../session/events.js";
import { SessionStore } from "../session/store.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { runHostTurn } from "./turn.js";
import type { HostTurnDependencies } from "./types.js";

export interface LocalAgentApi {
  createSession(cwd: string): Promise<SessionRecord>;
  sendMessage(input: {
    cwd: string;
    config: RuntimeConfig;
    sessionId: string;
    message: string;
    abortSignal?: AbortSignal;
  }): Promise<{
    session: SessionRecord;
    status: "completed" | "failed" | "aborted";
    errorMessage?: string;
  }>;
  listEvents(input: {
    cwd: string;
    sessionId: string;
    limit?: number;
  }): Promise<SessionEventRecord[]>;
  readStatus(cwd: string): ReturnType<typeof buildRuntimeStatus>;
}

export function createLocalAgentApi(dependencies: HostTurnDependencies = {}): LocalAgentApi {
  return {
    async createSession(cwd) {
      const paths = getProjectStatePaths(cwd);
      const store = new SessionStore(paths.sessionsDir, {
        memorySessionsDir: paths.sessionMemoryDir,
      });
      const events = new SessionEventStore(paths.eventsDir);
      const session = await store.save(await store.create(cwd));
      await events.append({
        type: "session.created",
        sessionId: session.id,
        cwd,
        host: "local-api",
      });
      return session;
    },
    async sendMessage(input) {
      const paths = getProjectStatePaths(input.cwd);
      const store = new SessionStore(paths.sessionsDir, {
        memorySessionsDir: paths.sessionMemoryDir,
      });
      const session = await store.load(input.sessionId);
      const outcome = await runHostTurn({
        input: input.message,
        cwd: input.cwd,
        config: input.config,
        session,
        sessionStore: store,
        abortSignal: input.abortSignal,
        host: "local-api",
      }, dependencies);
      return {
        session: outcome.session,
        status: outcome.status,
        errorMessage: outcome.errorMessage,
      };
    },
    async listEvents(input) {
      const paths = getProjectStatePaths(input.cwd);
      return new SessionEventStore(paths.eventsDir).list(input.sessionId, input.limit);
    },
    readStatus(cwd) {
      return buildRuntimeStatus(cwd);
    },
  };
}
