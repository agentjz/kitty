export const EXECUTION_KINDS = ["background"] as const;
export type ExecutionKind = (typeof EXECUTION_KINDS)[number];
