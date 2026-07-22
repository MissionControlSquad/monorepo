import { prisma } from "@/server/prisma";

// Recovery observability (parity #137). The stranded-work recovery system writes TaskRecoveryAction
// rows and there's a list query; this adds the missing SUMMARY — what recovery did at a glance
// (status breakdown, who detected it, resolved-rate, recent volume) for the observability surface.

export interface RecoveryStats {
  total: number;
  detected: number;
  attempting: number;
  resolved: number;
  failed: number;
  /** resolved / (resolved + failed); 0 when nothing has reached a terminal state. */
  resolvedRate: number;
  /** Rows created in the last 24h. */
  last24h: number;
  /** Detection source breakdown ("cron" | watchdogId), busiest first. */
  byDetectedBy: { detectedBy: string; count: number }[];
}

type StatusKey = "detected" | "attempting" | "resolved" | "failed";
const STATUS_KEYS: StatusKey[] = ["detected", "attempting", "resolved", "failed"];

export async function getRecoveryStats(now: Date = new Date()): Promise<RecoveryStats> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [byStatus, byDetectedBy, last24h] = await Promise.all([
    prisma.taskRecoveryAction.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.taskRecoveryAction.groupBy({ by: ["detectedBy"], _count: { _all: true } }),
    prisma.taskRecoveryAction.count({ where: { createdAt: { gte: since } } }),
  ]);

  const counts: Record<StatusKey, number> = {
    detected: 0,
    attempting: 0,
    resolved: 0,
    failed: 0,
  };
  for (const row of byStatus) {
    if ((STATUS_KEYS as string[]).includes(row.status)) {
      counts[row.status as StatusKey] = row._count._all;
    }
  }

  const total = STATUS_KEYS.reduce((sum, k) => sum + counts[k], 0);
  const terminal = counts.resolved + counts.failed;

  return {
    total,
    ...counts,
    resolvedRate: terminal > 0 ? counts.resolved / terminal : 0,
    last24h,
    byDetectedBy: byDetectedBy
      .map((r) => ({ detectedBy: r.detectedBy, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}
