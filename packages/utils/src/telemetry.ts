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

// Proposed (not-yet-wired) telemetry events. `scripts/extract-proposed-events.mjs` collects these
// markers into telemetry-proposed-events.json for review before they graduate into EventDimensionsMap.
// @telemetry-proposed budget.incident.opened dimensions: { policyId, thresholdType, scope }
// @telemetry-proposed budget.auto_paused dimensions: { policyId, agentId, scope }

/**
 * Typed dimension contract (parity: `EventDimensionsMap`). Maps each KNOWN event name → the exact
 * dimension keys that event carries in `props`. `makeTelemetryEvent` is generic over this map, so for
 * a known event name TypeScript pins `props` to its dimension shape — an unknown dimension key becomes
 * a compile error (object-literal excess-property check). Unknown/dynamic event names fall back to a
 * free `Record<string, unknown>`, which keeps every existing untyped call site compiling unchanged.
 *
 * To PROPOSE a new event + its dimensions before wiring it, mark the call with
 * `// @telemetry-proposed <name>` — `scripts/extract-proposed-events.mjs` collects those into a
 * manifest at build time (see that script's header).
 */
export interface EventDimensionsMap {
  "run.started": { runId: string; agentId: string };
  "run.finished": { runId: string; agentId: string; durationMs: number };
  "task.created": { taskId: string; projectId?: string };
  "task.completed": { taskId: string };
  "agent.hired": { agentId: string };
  "tool.denied": { toolName: string; agentId: string };
  "secret.resolved": { secretName: string };
  "plugin.installed": { pluginId: string };
}

export type KnownEventName = keyof EventDimensionsMap;

/** Dimensions type for an event name: the mapped shape for a known name, else a free record. */
export type DimensionsFor<N extends string> = N extends KnownEventName
  ? EventDimensionsMap[N]
  : Record<string, unknown>;

/** Input to `makeTelemetryEvent`, generic over the event name so `props` is typed per the map. */
export interface TelemetryEventInputFor<N extends string> {
  name: N;
  props?: DimensionsFor<N>;
  workspaceId: string;
  actorId?: string | null;
}

/** Non-generic input alias — the shape existing untyped call sites already use. */
export type TelemetryEventInput = TelemetryEventInputFor<string>;

export interface ShapedTelemetryEvent {
  name: string;
  props: Record<string, unknown>;
  workspaceId: string;
  actorId: string | null;
  retentionClass: TelemetryRetentionClass;
}

export class TelemetryError extends Error {}

/**
 * Pure: validate + shape an event, attaching its retention class. Throws on a missing name/workspace.
 * Generic over the event name: for a known name, `props` must match its `EventDimensionsMap` entry
 * (an unknown dimension is a compile error); for any other name, `props` stays a free record.
 */
export function makeTelemetryEvent<N extends string>(
  input: TelemetryEventInputFor<N>,
): ShapedTelemetryEvent {
  const name = input.name?.trim();
  if (!name) throw new TelemetryError("telemetry event name is required");
  if (!input.workspaceId?.trim()) throw new TelemetryError("workspaceId is required");
  return {
    name,
    props: (input.props ?? {}) as Record<string, unknown>,
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? null,
    retentionClass: retentionClassFor(name),
  };
}
