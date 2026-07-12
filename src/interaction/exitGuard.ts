import {
  collectRunningExecutionProcesses,
  terminateRunningExecutionProcesses,
  type RunningExecutionProcess,
  type TerminationResult,
} from "../execution/lifecycle.js";
import { resolveProjectRoots } from "../context/repoRoots.js";

export type InteractiveExitProcess = RunningExecutionProcess;

export type InteractiveExitTerminationResult = TerminationResult;

export interface InteractiveExitGuard {
  collectRunningProcesses(cwd: string, ownerSessionId: string): Promise<InteractiveExitProcess[]>;
  terminateProcesses(processes: InteractiveExitProcess[], cwd: string): Promise<InteractiveExitTerminationResult>;
}

export const defaultInteractiveExitGuard: InteractiveExitGuard = {
  collectRunningProcesses,
  terminateProcesses,
};

export async function collectRunningProcesses(cwd: string, ownerSessionId: string): Promise<InteractiveExitProcess[]> {
  const roots = await resolveProjectRoots(cwd);
  return collectRunningExecutionProcesses(roots.stateRootDir, ownerSessionId);
}

export async function terminateProcesses(
  processes: InteractiveExitProcess[],
  cwd: string,
): Promise<InteractiveExitTerminationResult> {
  const roots = await resolveProjectRoots(cwd);
  return terminateRunningExecutionProcesses(roots.stateRootDir, processes);
}
