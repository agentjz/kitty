import type { RuntimeConfig } from "../types.js";
import { buildRuntimeStatus } from "../runtime/status.js";
import { formatRuntimeStatusText } from "../runtime-ui/statusPresenter.js";

export async function formatRemoteRuntimeStatus(input: {
  rootDir: string;
  config: RuntimeConfig;
  sessionId: string;
}): Promise<string> {
  const status = await buildRuntimeStatus(input.rootDir, input.config.locale, {
    ownerSessionId: input.sessionId,
    config: input.config,
  });
  return formatRuntimeStatusText(status, input.config.locale).trimEnd();
}
