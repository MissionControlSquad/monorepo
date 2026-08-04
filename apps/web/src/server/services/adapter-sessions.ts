import { prisma } from "@/server/prisma";
import type { AdapterSession } from "@agentcenter/database";
import {
  sessionCodec,
  shouldCompactSession,
  type SessionParams,
  type CompactionThresholds,
} from "@agentcenter/utils";

// Adapter session service (parity #F9). Resolve the active session for an agent+adapter (resume), record
// a run's usage against it, and rotate it when the compaction policy fires. The runtime resume-exec is
// the seam; this owns persistence + rotation. Workspace-scoped.

/** The active session for an agent+adapter, or null if none yet. */
export function getActiveSession(
  workspaceId: string,
  agentId: string,
  adapterKey: string,
): Promise<AdapterSession | null> {
  return prisma.adapterSession.findFirst({
    where: { workspaceId, agentId, adapterKey, active: true },
    orderBy: { lastUsedAt: "desc" },
  });
}

/** Start a new active session (deactivating any prior active one for the same agent+adapter). */
export async function startSession(input: {
  workspaceId: string;
  agentId: string;
  adapterKey: string;
  params: SessionParams;
}): Promise<AdapterSession> {
  await prisma.adapterSession.updateMany({
    where: {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      adapterKey: input.adapterKey,
      active: true,
    },
    data: { active: false, compactedAt: new Date() },
  });
  return prisma.adapterSession.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      adapterKey: input.adapterKey,
      displayId: sessionCodec.getDisplayId(input.params),
      sessionParams: sessionCodec.deserialize(sessionCodec.serialize(input.params)) as never,
    },
  });
}

/**
 * Record a completed run against the active session (increment runCount + tokens), then apply the
 * compaction policy: if it fires, the session is rotated (deactivated) so the next run starts fresh.
 * Returns the session as it stands after (rotated = inactive). No-op-safe if there is no active session.
 */
export async function recordSessionRun(
  workspaceId: string,
  agentId: string,
  adapterKey: string,
  usage: { tokens?: number },
  thresholds: CompactionThresholds = {},
): Promise<{ session: AdapterSession | null; rotated: boolean; reason: string | null }> {
  const session = await getActiveSession(workspaceId, agentId, adapterKey);
  if (!session) return { session: null, rotated: false, reason: null };

  const updated = await prisma.adapterSession.update({
    where: { id: session.id },
    data: {
      runCount: { increment: 1 },
      tokens: { increment: Math.max(0, usage.tokens ?? 0) },
      lastUsedAt: new Date(),
    },
  });

  const decision = shouldCompactSession(
    {
      runCount: updated.runCount,
      tokens: updated.tokens,
      ageMs: Date.now() - updated.startedAt.getTime(),
    },
    thresholds,
  );
  if (!decision.compact) return { session: updated, rotated: false, reason: null };

  const rotated = await prisma.adapterSession.update({
    where: { id: session.id },
    data: { active: false, compactedAt: new Date() },
  });
  return { session: rotated, rotated: true, reason: decision.reason };
}
