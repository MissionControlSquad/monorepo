import { prisma } from "@/server/prisma";
import { reclaimStalePluginJobs } from "@/server/services/plugin-jobs";
import { toolRuntimeMetrics } from "@/server/services/tool-runtime-metrics";

// Tool runtime supervisor (parity #168). A read/health surface over the plugin-job queue and tool
// metrics, plus a reconcile pass the heartbeat calls to reclaim stale leases. It does not spawn or kill
// workers (that is the infra-gated worker-manager); it reports queue health and unblocks stuck work.
// Workspace-scoped.

export interface ToolRuntimeHealth {
  jobs: { queued: number; running: number; failed: number; overdue: number };
  reclaimedStale: number;
  /** Tools with the worst success rate over the window (min 3 calls), worst first. */
  degradedTools: { toolName: string; calls: number; successRate: number }[];
  healthy: boolean; // no failed jobs and no degraded tools (a due/overdue job is normal, not unhealthy)
}

/**
 * Assess runtime health and reconcile stale work in one pass. `reclaim` (default true) reclaims leases
 * older than the stale window before counting, so a dead worker's jobs are counted as queued again.
 */
export async function superviseToolRuntime(
  workspaceId: string,
  opts: { reclaim?: boolean; staleMs?: number; sinceHours?: number } = {},
): Promise<ToolRuntimeHealth> {
  const reclaimedStale =
    opts.reclaim === false ? 0 : await reclaimStalePluginJobs(workspaceId, opts.staleMs);

  const now = new Date();
  const [queued, running, failed, overdue] = await Promise.all([
    prisma.pluginJob.count({ where: { workspaceId, status: "queued" } }),
    prisma.pluginJob.count({ where: { workspaceId, status: "running" } }),
    prisma.pluginJob.count({ where: { workspaceId, status: "failed" } }),
    prisma.pluginJob.count({
      where: { workspaceId, status: "queued", scheduledFor: { lt: now } },
    }),
  ]);

  const metrics = await toolRuntimeMetrics(workspaceId, { sinceHours: opts.sinceHours });
  const degradedTools = metrics
    .filter((m) => m.calls >= 3 && m.successRate < 0.8)
    .map((m) => ({ toolName: m.toolName, calls: m.calls, successRate: m.successRate }))
    .sort((a, b) => a.successRate - b.successRate);

  return {
    jobs: { queued, running, failed, overdue },
    reclaimedStale,
    degradedTools,
    healthy: failed === 0 && degradedTools.length === 0,
  };
}
