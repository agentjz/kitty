export type ExecutionLifecycleErrorCode =
  | "UNKNOWN_EXECUTION"
  | "EXECUTION_KIND_MISMATCH"
  | "EXECUTION_WAIT_ABORTED";

export class ExecutionLifecycleError extends Error {
  constructor(
    readonly code: ExecutionLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionLifecycleError";
  }
}

export function unknownExecution(id: string): ExecutionLifecycleError {
  return new ExecutionLifecycleError("UNKNOWN_EXECUTION", `Unknown execution: ${id}`);
}

export function executionKindMismatch(id: string, actual: string, expected: string): ExecutionLifecycleError {
  return new ExecutionLifecycleError(
    "EXECUTION_KIND_MISMATCH",
    `Execution ${id} is '${actual}', not '${expected}'.`,
  );
}
