import { buildRunTurnResult, createFinalizeTransition } from "../agent/runtimeTransition.js";
import type { RunTurnResult } from "../agent/types.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import type { waitForLeadWaitExecutions } from "../execution/leadWait.js";
import { noteCheckpointCompleted } from "../session/checkpoint.js";
import { createMessage } from "../session/messages.js";
import type { HostTurnOptions } from "./types.js";

export async function completeExactDelegatedCloseout(input: {
  session: HostTurnOptions["session"];
  sessionStore: HostTurnOptions["sessionStore"];
  stateRootDir: string;
  callbacks?: HostTurnOptions["callbacks"];
  executions: Awaited<ReturnType<typeof waitForLeadWaitExecutions>>;
}): Promise<RunTurnResult | undefined> {
  const answer = resolveExactDelegatedAnswer(input.executions);
  if (!answer) {
    return undefined;
  }

  const transition = createFinalizeTransition({
    changedPaths: [],
  });
  const sessionWithAnswer = await input.sessionStore.appendMessages(input.session, [
    createMessage("assistant", answer),
  ]);
  const session = await input.sessionStore.save(noteCheckpointCompleted(sessionWithAnswer, transition));
  const ledger = new ControlPlaneLedger(input.stateRootDir);
  try {
    ledger.taskLifecycle.complete({
      sessionId: session.id,
      reason: "finalize.delegated_exact_output",
      completionFacts: [answer],
    });
  } finally {
    ledger.close();
  }
  input.callbacks?.onAssistantText?.(answer);
  input.callbacks?.onAssistantDone?.(answer);
  return buildRunTurnResult({
    session,
    changedPaths: [],
    transition,
  });
}

function resolveExactDelegatedAnswer(executions: readonly { assignment?: { expectedOutput?: string }; output?: string; status: string }[]): string | undefined {
  if (executions.length !== 1) {
    return undefined;
  }
  const [execution] = executions;
  if (!execution || execution.status !== "completed") {
    return undefined;
  }
  const expected = execution.assignment?.expectedOutput?.trim();
  const output = execution.output?.trim();
  if (!expected || !output || expected !== output) {
    return undefined;
  }
  return output;
}
