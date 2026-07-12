export const EXECUTION_KINDS = ["foreground", "background"] as const;
export type ExecutionKind = (typeof EXECUTION_KINDS)[number];
