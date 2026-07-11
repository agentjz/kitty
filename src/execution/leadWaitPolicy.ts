export const LEAD_WAIT_TERMINAL_STATUSES = ["completed", "failed", "aborted", "lost"] as const;

export type LeadWaitMode = "none" | "while_execution_active";
export type LeadWakePolicy = "optional" | "required";
export type LeadWaitScope = "global" | "objective" | "task";
export type LeadWaitTerminalStatus = typeof LEAD_WAIT_TERMINAL_STATUSES[number];

export interface LeadWaitPolicy {
  lead: LeadWaitMode;
  wake: LeadWakePolicy;
  scope: LeadWaitScope;
  terminalStatuses: readonly LeadWaitTerminalStatus[];
}

export type LeadWaitPolicyInput = Partial<LeadWaitPolicy>;

export function createLeadWaitPolicy(input: LeadWaitPolicyInput = {}): LeadWaitPolicy {
  const lead = input.lead ?? "none";
  const policy: LeadWaitPolicy = {
    lead,
    wake: input.wake ?? (lead === "while_execution_active" ? "required" : "optional"),
    scope: input.scope ?? "objective",
    terminalStatuses: [...(input.terminalStatuses ?? LEAD_WAIT_TERMINAL_STATUSES)],
  };
  assertLeadWaitPolicy(policy);
  return policy;
}

export function assertLeadWaitPolicy(policy: LeadWaitPolicy): void {
  if (policy.lead !== "none" && policy.lead !== "while_execution_active") {
    throw new Error(`Unsupported lead wait mode '${String(policy.lead)}'.`);
  }
  if (policy.wake !== "optional" && policy.wake !== "required") {
    throw new Error(`Unsupported lead wake policy '${String(policy.wake)}'.`);
  }
  if (policy.scope !== "global" && policy.scope !== "objective" && policy.scope !== "task") {
    throw new Error(`Unsupported lead wait scope '${String(policy.scope)}'.`);
  }
  if (policy.lead === "while_execution_active" && policy.wake !== "required") {
    throw new Error("Lead-blocking executions must publish a required wake signal.");
  }
  if (policy.terminalStatuses.length === 0) {
    throw new Error("Lead wait policy must define at least one terminal status.");
  }
  for (const status of policy.terminalStatuses) {
    if (!(LEAD_WAIT_TERMINAL_STATUSES as readonly string[]).includes(status)) {
      throw new Error(`Unsupported lead wait terminal status '${String(status)}'.`);
    }
  }
}

export function isLeadBlockingPolicy(policy: LeadWaitPolicy | undefined): boolean {
  return policy?.lead === "while_execution_active";
}

export function isLeadWaitTerminalStatus(
  policy: LeadWaitPolicy | undefined,
  status: string,
): boolean {
  return (policy ?? createLeadWaitPolicy()).terminalStatuses.includes(status as LeadWaitTerminalStatus);
}

export function normalizeLeadWaitPolicy(value: unknown): LeadWaitPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createLeadWaitPolicy();
  }

  const record = value as Record<string, unknown>;
  return createLeadWaitPolicy({
    lead: record.lead === "while_execution_active" ? "while_execution_active" : "none",
    wake: record.wake === "required" ? "required" : "optional",
    scope: record.scope === "global" || record.scope === "task" ? record.scope : "objective",
    terminalStatuses: Array.isArray(record.terminalStatuses)
      ? record.terminalStatuses.filter((status): status is LeadWaitTerminalStatus =>
          (LEAD_WAIT_TERMINAL_STATUSES as readonly string[]).includes(String(status)))
      : undefined,
  });
}
