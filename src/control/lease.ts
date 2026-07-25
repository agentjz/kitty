export const DEFAULT_LEASE_MS = 30_000;

export type LeaseResourceKind = "turn" | "execution" | "service" | "capability" | "tool_call";

export class LeaseOwnershipLostError extends Error {
  readonly code = "LEASE_OWNERSHIP_LOST";

  constructor(
    readonly resourceKind: LeaseResourceKind,
    readonly resourceId: string,
  ) {
    super(`${capitalize(resourceKind)} ${resourceId} no longer owns its lease.`);
    this.name = "LeaseOwnershipLostError";
  }
}

export function isLeaseOwnershipLostError(error: unknown): error is LeaseOwnershipLostError {
  return error instanceof LeaseOwnershipLostError;
}

export function buildLeaseDeadline(now: Date, leaseMs = DEFAULT_LEASE_MS): string {
  return new Date(now.getTime() + leaseMs).toISOString();
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
