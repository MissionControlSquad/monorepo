/**
 * Observability summary (Epic #13) — DB aggregation. The pure bucketers live in @agentcenter/utils
 * (web/desktop/mobile); this file runs the group-by queries and calls them.
 */
import { prisma } from "@/server/prisma";
import {
  bucketAgentCounts,
  bucketTaskCounts,
  getUtcMonthStart,
  type AgentSummary,
  type TaskSummary,
} from "@agentcenter/utils";

export type { AgentSummary, TaskSummary } from "@agentcenter/utils";

export interface WorkspaceSummary {
  agents: AgentSummary;
  tasks: TaskSummary;
  monthSpendCents: number;
  pendingApprovals: number;
  activeBudgetIncidents: number;
}

type Count = { status: string; _count: { _all: number } };

export async function getWorkspaceSummary(
  workspaceId: string,
  now: Date = new Date(),
): Promise<WorkspaceSummary> {
  const monthStart = getUtcMonthStart(now);
  const [agentRows, taskRows, spend, pendingApprovals, activeBudgetIncidents] = await Promise.all([
    prisma.agent.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    // Task has no workspaceId (D5) — scope via its project's workspace.
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
    agents: bucketAgentCounts(agentRows as Count[]),
    tasks: bucketTaskCounts(taskRows as Count[]),
    monthSpendCents: spend._sum.amountCents ?? 0,
    pendingApprovals,
    activeBudgetIncidents,
  };
}
