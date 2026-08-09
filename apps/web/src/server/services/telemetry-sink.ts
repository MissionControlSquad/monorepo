import { prisma } from "@/server/prisma";
import type { TelemetryEvent } from "@agentcenter/database";
import {
  makeTelemetryEvent,
  RETENTION_DAYS,
  type TelemetryEventInput,
  type TelemetryRetentionClass,
} from "@agentcenter/utils";

// Telemetry sink (parity #E1-E4). Ingests first-party analytics events (shaped by the pure contract) and
// prunes them by retention class. Ingestion never throws to the caller — a telemetry failure must not
// break the operation being measured. Workspace-scoped.

/** Record one event. Swallows errors (returns null) — telemetry is best-effort. */
export async function recordTelemetry(input: TelemetryEventInput): Promise<TelemetryEvent | null> {
  try {
    const e = makeTelemetryEvent(input);
    return await prisma.telemetryEvent.create({
      data: {
        workspaceId: e.workspaceId,
        name: e.name,
        props: (e.props ?? undefined) as never,
        actorId: e.actorId,
        retentionClass: e.retentionClass,
      },
    });
  } catch (err) {
    console.error("[telemetry] ingest failed (swallowed)", err);
    return null;
  }
}

/** Batch ingest — best-effort; invalid events are skipped, valid ones inserted in one call. */
export async function recordTelemetryBatch(inputs: TelemetryEventInput[]): Promise<number> {
  const rows = [];
  for (const input of inputs) {
    try {
      const e = makeTelemetryEvent(input);
      rows.push({
        workspaceId: e.workspaceId,
        name: e.name,
        props: (e.props ?? undefined) as never,
        actorId: e.actorId,
        retentionClass: e.retentionClass,
      });
    } catch {
      /* skip invalid */
    }
  }
  if (rows.length === 0) return 0;
  const { count } = await prisma.telemetryEvent.createMany({ data: rows });
  return count;
}

/**
 * Prune events past their class retention window. Runs one delete per class so each honors its own
 * RETENTION_DAYS. Returns total rows deleted. The heartbeat calls this.
 */
export async function pruneTelemetry(): Promise<number> {
  let deleted = 0;
  for (const [cls, days] of Object.entries(RETENTION_DAYS) as [TelemetryRetentionClass, number][]) {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const { count } = await prisma.telemetryEvent.deleteMany({
      where: { retentionClass: cls, createdAt: { lt: cutoff } },
    });
    deleted += count;
  }
  return deleted;
}
