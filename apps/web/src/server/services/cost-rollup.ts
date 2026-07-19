/**
 * Issue-tree cost + runtime rollup (Domain 12 GAP-6 A12). Sums CostEvent spend and AgentRun wall-clock
 * over a task AND all its descendants (recursive over Task.parentTaskId). Cost/runtime are workspace-
 * scoped (only this workspace's events count) so the tree walk itself needs no tenant filter.
 */
import { prisma } from "@/server/prisma";

export interface TaskTreeCost {
  rootTaskId: string;
  taskCount: number; // tasks in the subtree (incl. or excl. root per `excludeRoot`)
  costCents: number;
  eventCount: number;
  runCount: number;
  runtimeSeconds: number;
}

/**
 * Roll up cost + runtime over a task subtree. `excludeRoot` omits the root task's own direct
 * events/runs (counting only descendants). Returns zeros for an unknown/empty subtree.
 */
export async function costByTaskTree(
  workspaceId: string,
  rootTaskId: string,
  excludeRoot = false,
): Promise<TaskTreeCost> {
  // Subtree task ids (recursive over parentTaskId).
  const subtreeRows = await prisma.$queryRaw<{ id: string; depth: number }[]>`
    WITH RECURSIVE subtree AS (
      SELECT id, 0 AS depth FROM "tasks" WHERE id = ${rootTaskId}
      UNION ALL
      SELECT t.id, s.depth + 1 FROM "tasks" t JOIN subtree s ON t."parentTaskId" = s.id
    )
    SELECT id, depth FROM subtree`;

  const ids = subtreeRows.filter((r) => !(excludeRoot && r.depth === 0)).map((r) => r.id);
  if (ids.length === 0) {
    return {
      rootTaskId,
      taskCount: 0,
      costCents: 0,
      eventCount: 0,
      runCount: 0,
      runtimeSeconds: 0,
    };
  }

  const [cost] = await prisma.$queryRaw<{ cost_cents: number; event_count: number }[]>`
    SELECT COALESCE(SUM("amountCents"), 0)::int AS cost_cents, COUNT(*)::int AS event_count
    FROM "cost_events"
    WHERE "workspaceId" = ${workspaceId} AND "taskId" = ANY(${ids}::text[])`;

  const [runs] = await prisma.$queryRaw<{ run_count: number; runtime_seconds: number }[]>`
    SELECT COUNT(*)::int AS run_count,
           COALESCE(SUM(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt"))), 0)::int AS runtime_seconds
    FROM "agent_runs"
    WHERE "workspaceId" = ${workspaceId} AND "taskId" = ANY(${ids}::text[]) AND "finishedAt" IS NOT NULL`;

  return {
    rootTaskId,
    taskCount: ids.length,
    costCents: Number(cost?.cost_cents ?? 0),
    eventCount: Number(cost?.event_count ?? 0),
    runCount: Number(runs?.run_count ?? 0),
    runtimeSeconds: Number(runs?.runtime_seconds ?? 0),
  };
}
