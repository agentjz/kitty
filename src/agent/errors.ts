import type { SessionRecord } from "../types.js";
import { formatProviderError } from "../provider/errors.js";

export class AgentTurnError extends Error {
  readonly session: SessionRecord;

  constructor(message: string, session: SessionRecord, options?: { cause?: unknown }) {
    super(message);
    this.name = "AgentTurnError";
    this.session = session;

    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("api key missing") || message.toLowerCase().includes("no api key found")) {
    return "User-fixable error: API key not found. Set `KITTY_API_KEY` in the current project `.kitty/.env`.";
  }
  return formatProviderError(error) ?? message;
}
