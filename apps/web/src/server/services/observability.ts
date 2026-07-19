/**
 * Observability summary (Epic #13). A single workspace-scoped rollup — agent + task status buckets,
 * pending approvals, month-to-date spend, active budget incidents. Read-only; no new tables. Ports
 * Paperclip `services/dashboard.ts` (minus run-activity — no heartbeat-run source; spec D2).
 */
import { prisma } from "@/server/prisma";

export interface AgentSummary {
  total: number;
  operational: number; // idle + active (D3)
  blocked: number;
  idle: number;
  active: number;
}
export interface TaskSummary {
  total: number;
  open: number; // all non-done (faithful to Paperclip status !== done)
  inProgress: number;
  review: number;
  blocked: number;
  done: number;
}
export interface WorkspaceSummary {
  agents: AgentSummary;
  tasks: TaskSummary;
  monthSpendCents: number;
  pendingApprovals: number;
  activeBudgetIncidents: number;
}

type Count<T extends string> = { status: T; _count: { _all: number } };

/** Pure: bucket agent status group-counts. Unknown statuses contribute to `total` only. */
export function bucketAgentCounts(rows: Count<string>[]): AgentSummary {
  const s: AgentSummary = { total: 0, operational: 0, blocked: 0, idle: 0, active: 0 };
  for (const row of rows) {
    const n = row._count._all;
    s.total += n;
    if (row.status === "idle") {
      s.idle += n;
      s.operational += n;
    } else if (row.status === "active") {
      s.active += n;
      s.operational += n;
    } else if (row.status === "blocked") {
      s.blocked += n;
    }
  }
  return s;
}

/** Pure: bucket task status group-counts. `open` = every non-done task (superset of the splits). */
export function bucketTaskCounts(rows: Count<string>[]): TaskSummary {
  const s: TaskSummary = { total: 0, open: 0, inProgress: 0, review: 0, blocked: 0, done: 0 };
  for (const row of rows) {
    const n = row._count._all;
    s.total += n;
    if (row.status === "done") {
      s.done += n;
    } else {
      s.open += n;
      if (row.status === "in_progress") s.inProgress += n;
      else if (row.status === "review") s.review += n;
      else if (row.status === "blocked") s.blocked += n;
    }
  }
  return s;
}

/** Pure: first instant of `date`'s UTC month. Ported from Paperclip `getUtcMonthStart`. */
export function getUtcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function getWorkspaceSummary(
  workspaceId: string,
  now: Date = new Date(),
): Promise<WorkspaceSummary> {
  const monthStart = getUtcMonthStart(now);
  const [agentRows, taskRows, spend, pendingApprovals, activeBudgetIncidents] = await Promise.all([
    prisma.agent.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    // Task has no workspaceId (D5) — scope via its project's workspace. Projectless tasks belong to
    // no workspace and are excluded from the per-workspace rollup.
    prisma.task.groupBy({
      by: ["status"],
      where: { project: { workspaceId } },
      _count: { _all: true },
    }),
    prisma.costEvent.aggregate({
      where: { workspaceId, occurredAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    prisma.approval.count({ where: { workspaceId, status: "pending" } }),
    prisma.budgetIncident.count({ where: { workspaceId, status: "open" } }),
  ]);

  return {
    agents: bucketAgentCounts(agentRows as Count<string>[]),
    tasks: bucketTaskCounts(taskRows as Count<string>[]),
    monthSpendCents: spend._sum.amountCents ?? 0,
    pendingApprovals,
    activeBudgetIncidents,
  };
}
