import type { AgentIdentity } from "../agent/types.js";

export const EXECUTION_KINDS = ["background", "subagent"] as const;
export type ExecutionKind = (typeof EXECUTION_KINDS)[number];

export const AGENT_WORKER_EXECUTION_KINDS = ["subagent"] as const satisfies readonly ExecutionKind[];
export type AgentWorkerExecutionKind = (typeof AGENT_WORKER_EXECUTION_KINDS)[number];

export function isAgentWorkerExecutionKind(kind: ExecutionKind): kind is AgentWorkerExecutionKind {
  return (AGENT_WORKER_EXECUTION_KINDS as readonly ExecutionKind[]).includes(kind);
}

export function toAgentWorkerIdentityKind(kind: AgentWorkerExecutionKind): AgentIdentity["kind"] {
  return kind;
}
