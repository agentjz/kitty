const MAX_SIGNATURE_CHARS = 6_000;

export interface ToolBatchEvidence {
  toolCalls: readonly ToolCallEvidence[];
  modelOutputs: readonly string[];
  changedPaths: readonly string[];
}

export interface ToolCallEvidence {
  name: string;
  arguments: string;
}

export interface ToolLoopProgressState {
  lastSignature?: string;
  repeatedCount: number;
  forceCloseout: boolean;
}

export interface ToolLoopProgressDecision {
  state: ToolLoopProgressState;
  internalFactBlock?: string;
}

export function createToolLoopProgressState(): ToolLoopProgressState {
  return {
    repeatedCount: 0,
    forceCloseout: false,
  };
}

export function recordToolBatchProgress(
  state: ToolLoopProgressState,
  evidence: ToolBatchEvidence,
): ToolLoopProgressDecision {
  const signature = buildToolBatchSignature(evidence);
  const repeatedCount = state.lastSignature === signature ? state.repeatedCount + 1 : 0;
  const forceCloseout = repeatedCount >= 2;

  return {
    state: {
      lastSignature: signature,
      repeatedCount,
      forceCloseout,
    },
    internalFactBlock: repeatedCount > 0 ? buildCloseoutFactBlock(evidence, forceCloseout) : undefined,
  };
}

export function consumeToolLoopCloseout(state: ToolLoopProgressState): ToolLoopProgressState {
  return {
    ...state,
    forceCloseout: false,
  };
}

function buildToolBatchSignature(evidence: ToolBatchEvidence): string {
  const raw = JSON.stringify({
    toolCalls: evidence.toolCalls.map((call) => ({
      name: call.name,
      arguments: normalizeToolArguments(call.arguments),
    })),
    modelOutputs: evidence.modelOutputs,
    changedPaths: evidence.changedPaths,
  });
  return raw.length <= MAX_SIGNATURE_CHARS ? raw : raw.slice(0, MAX_SIGNATURE_CHARS);
}

function buildCloseoutFactBlock(evidence: ToolBatchEvidence, forceCloseout: boolean): string {
  return [
    "Tool loop boundary",
    "The latest tool batch repeated the same tool names and returned the same model-visible facts as the previous batch.",
    `Repeated tools: ${evidence.toolCalls.map((call) => call.name).join(", ") || "none"}`,
    evidence.changedPaths.length > 0 ? `Changed paths: ${evidence.changedPaths.join(", ")}` : "Changed paths: none",
    forceCloseout
      ? "The runtime is stopping this turn because another identical tool batch would not add evidence."
      : "Close the turn from the available evidence, or state the exact blocker if the evidence is insufficient.",
  ].join("\n");
}

function normalizeToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw.trim();
  }
}
