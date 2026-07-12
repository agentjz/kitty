import { ControlPlaneLedger } from "../control/ledger.js";
import type { SessionStoreLike } from "../session/store.js";

export function createTurnScopedSessionStore(
  store: SessionStoreLike,
  ownership: { rootDir: string; sessionId: string; turnId: string; ownerToken: string },
): SessionStoreLike {
  const assertOwner = (): void => {
    const ledger = new ControlPlaneLedger(ownership.rootDir);
    try {
      ledger.turns.assertOwner(ownership.turnId, ownership.ownerToken);
    } finally {
      ledger.close();
    }
  };
  const assertSession = (sessionId: string): void => {
    if (sessionId !== ownership.sessionId) {
      throw new Error(`Turn ${ownership.turnId} cannot write session ${sessionId}.`);
    }
    assertOwner();
  };
  return {
    create: (cwd) => store.create(cwd),
    load: (id) => store.load(id),
    loadLatest: () => store.loadLatest(),
    list: (limit) => store.list(limit),
    listReadable: store.listReadable ? (limit) => store.listReadable!(limit) : undefined,
    async save(session) {
      assertSession(session.id);
      const saved = await store.save(session);
      assertOwner();
      return saved;
    },
    async appendMessages(session, messages) {
      assertSession(session.id);
      const saved = await store.appendMessages(session, messages);
      assertOwner();
      return saved;
    },
  };
}
