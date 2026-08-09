import { prisma } from "@/server/prisma";
import { shouldRetryRun } from "@agentcenter/utils";

// Boot / hot-restart reconciliation (parity #73). When the server restarts, any AgentRun still marked
// `running` is orphaned — the process that was executing it is gone. This reaps those stale runs (marks
// them `timeout` and stamps finishedAt) so they don't hang forever, and reports which are retry-eligible
// so the retry path can re-dispatch them. Called on boot and periodically by the heartbeat.

/** Pure: is a `running` run considered orphaned — still running but untouched for longer than staleMs? */
export function isRunOrphaned(
  status: string,
  updatedAt: Date,
  now: number,
  staleMs: number,
): boolean {
  return status === "running" && now - updatedAt.getTime() >= staleMs;
}

export interface ReapResult {
  reaped: number;
  retryable: string[]; // ids of reaped runs eligible for automatic retry
}

/**
 * Reap orphaned runs. `staleMs` guards against reaping a run that's legitimately mid-flight (default 0
 * on boot = reap every running row, since the process is definitively gone; pass a window for the
 * periodic heartbeat sweep). Returns the count reaped + which are retry-eligible.
 */
export async function reapOrphanedRuns(
  opts: { staleMs?: number; workspaceId?: string; reason?: string } = {},
): Promise<ReapResult> {
  const staleMs = opts.staleMs ?? 0;
  const cutoff = new Date(Date.now() - staleMs);
  const reason = opts.reason ?? "reaped: orphaned by server restart";

  const orphaned = await prisma.agentRun.findMany({
    where: {
      status: "running",
      updatedAt: { lte: cutoff },
      ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    },
    select: { id: true, retryCount: true },
  });
  if (orphaned.length === 0) return { reaped: 0, retryable: [] };

  const ids = orphaned.map((r) => r.id);
  await prisma.agentRun.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "timeout",
      finishedAt: new Date(),
      stderr: reason,
    },
  });

  // "timeout" is a transient status, so reaped runs are retry-eligible until they exhaust retries.
  const retryable = orphaned
    .filter((r) => shouldRetryRun("timeout", r.retryCount ?? 0))
    .map((r) => r.id);
  return { reaped: ids.length, retryable };
}
