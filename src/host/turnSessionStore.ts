import { ControlPlaneLedger } from "../control/ledger.js";
import type { SessionStoreLike } from "../session/store.js";

export function createTurnScopedSessionStore(
  store: SessionStoreLike,
  ownership: { rootDir: string; sessionId: string; turnId: string; ownerToken: string; ownerGeneration: number },
): SessionStoreLike {
  const assertSession = (sessionId: string): void => {
    if (sessionId !== ownership.sessionId) {
      throw new Error(`Turn ${ownership.turnId} cannot write session ${sessionId}.`);
    }
  };
  const saveOwned = async (session: Parameters<SessionStoreLike["save"]>[0]) => {
    assertSession(session.id);
    const ledger = new ControlPlaneLedger(ownership.rootDir);
    try {
      return ledger.sessions.saveOwned({
        session,
        turnId: ownership.turnId,
        ownerToken: ownership.ownerToken,
        ownerGeneration: ownership.ownerGeneration,
      });
    } finally {
      ledger.close();
    }
  };
  return {
    create: (cwd) => store.create(cwd),
    load: (id) => store.load(id),
    loadLatest: () => store.loadLatest(),
    list: (limit) => store.list(limit),
    listReadable: store.listReadable ? (limit) => store.listReadable!(limit) : undefined,
    async save(session) {
      return saveOwned(session);
    },
    async appendMessages(session, messages) {
      return saveOwned({ ...session, messages: [...session.messages, ...messages] });
    },
  };
}
