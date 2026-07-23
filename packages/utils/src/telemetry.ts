// First-party telemetry contract (parity #E1-E4, pure half). A typed event schema + retention-class
// table for product analytics — distinct from OTel tracing (which is the live-collector path). PURE:
// makeTelemetryEvent shapes + validates an event; the retention map keys how long each class is kept.
// The DB sink + prune job live in the service layer. No live collector/provider needed.

/** Retention classes — how long an event class is kept before the prune job drops it. */
export const TELEMETRY_RETENTION_CLASS = {
  operational: "operational", // short-lived ops signals
  product: "product", // product-analytics events
  audit: "audit", // long-retention audit trail
} as const;
export type TelemetryRetentionClass =
  (typeof TELEMETRY_RETENTION_CLASS)[keyof typeof TELEMETRY_RETENTION_CLASS];

export const RETENTION_DAYS: Record<TelemetryRetentionClass, number> = {
  operational: 14,
  product: 90,
  audit: 400,
};

/** Curated event-name → retention-class registry. Unknown names default to `operational`. */
export const EVENT_RETENTION_CLASS: Record<string, TelemetryRetentionClass> = {
  "run.started": "operational",
  "run.finished": "product",
  "task.created": "product",
  "task.completed": "product",
  "agent.hired": "product",
  "tool.denied": "audit",
  "secret.resolved": "audit",
  "plugin.installed": "audit",
};

export function retentionClassFor(name: string): TelemetryRetentionClass {
  return EVENT_RETENTION_CLASS[name] ?? "operational";
}

export interface TelemetryEventInput {
  name: string;
  props?: Record<string, unknown>;
  workspaceId: string;
  actorId?: string | null;
}

export interface ShapedTelemetryEvent {
  name: string;
  props: Record<string, unknown>;
  workspaceId: string;
  actorId: string | null;
  retentionClass: TelemetryRetentionClass;
}

export class TelemetryError extends Error {}

/** Pure: validate + shape an event, attaching its retention class. Throws on a missing name/workspace. */
export function makeTelemetryEvent(input: TelemetryEventInput): ShapedTelemetryEvent {
  const name = input.name?.trim();
  if (!name) throw new TelemetryError("telemetry event name is required");
  if (!input.workspaceId?.trim()) throw new TelemetryError("workspaceId is required");
  return {
    name,
    props: input.props ?? {},
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? null,
    retentionClass: retentionClassFor(name),
  };
}
