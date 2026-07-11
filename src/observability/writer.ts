import { getProjectStatePaths } from "../project/statePaths.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { buildObservabilityEventRecord, type ObservabilityEventInput, type ObservabilityEventRecord } from "./schema.js";

export async function appendObservabilityEvent(
  rootDir: string,
  input: ObservabilityEventInput,
): Promise<ObservabilityEventRecord> {
  const record = buildObservabilityEventRecord(input);
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    return ledger.runtimeEvents.append(record);
  } finally {
    ledger.close();
  }
}

export async function recordObservabilityEvent(
  rootDir: string,
  input: ObservabilityEventInput,
): Promise<void> {
  try {
    await appendObservabilityEvent(rootDir, input);
  } catch {
    // Observability is a side-channel only. It must not break the formal path.
  }
}

export function getObservabilityPaths(rootDir: string) {
  return getProjectStatePaths(rootDir);
}
