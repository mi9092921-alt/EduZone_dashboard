/** Domain event base type */
export interface DomainEvent<T = unknown> {
  /** Unique event name (e.g., 'user.suspended') */
  name: string;
  /** Timestamp of the event */
  timestamp: string;
  /** Actor who triggered the event */
  actorId: string;
  /** Tenant context */
  tenantId: string;
  /** Trace ID for observability */
  traceId: string;
  /** Event-specific payload */
  payload: T;
}

/** Create a typed domain event */
export function createDomainEvent<T>(
  name: string,
  actorId: string,
  tenantId: string,
  traceId: string,
  payload: T,
): DomainEvent<T> {
  return {
    name,
    timestamp: new Date().toISOString(),
    actorId,
    tenantId,
    traceId,
    payload,
  };
}
