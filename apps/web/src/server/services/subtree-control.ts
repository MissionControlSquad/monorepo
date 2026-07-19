/**
 * Subtree cancel / restore (Domain 8 G6.6). Beyond hold/release, a manager can CANCEL a whole task
 * subtree (root + all descendants → status cancelled) or RESTORE a previously-subtree-cancelled tree
 * back to actionable. Uses a recursive CTE over Task.parentTaskId. Only non-terminal tasks are
 * cancelled; restore only un-cancels tasks (never resurrects a done one).
 */
import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";

async function subtreeIds(rootTaskId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT id FROM "tasks" WHERE id = ${rootTaskId}
      UNION ALL
      SELECT t.id FROM "tasks" t JOIN subtree s ON t."parentTaskId" = s.id
    )
    SELECT id FROM subtree`;
  return rows.map((r) => r.id);
}

/**
 * Cancel a task subtree (root + descendants). Only tasks not already terminal (done/cancelled) are
 * moved to cancelled with cancelledAt set. Returns the number of tasks cancelled.
 */
export async function cancelSubtree(rootTaskId: string): Promise<number> {
  const root = await prisma.task.findFirst({
    where: { id: rootTaskId, deletedAt: null },
    select: { id: true },
  });
  if (!root) throw new GraphQLError("Task not found", { extensions: { code: "NOT_FOUND" } });
  const ids = await subtreeIds(rootTaskId);
  const res = await prisma.task.updateMany({
    where: { id: { in: ids }, status: { notIn: ["done", "cancelled"] }, deletedAt: null },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  return res.count;
}

/**
 * Restore a subtree: un-cancel every cancelled task under the root back to `assigned` (clearing
 * cancelledAt). Never touches done tasks. Returns the number restored.
 */
export async function restoreSubtree(rootTaskId: string): Promise<number> {
  const root = await prisma.task.findFirst({
    where: { id: rootTaskId, deletedAt: null },
    select: { id: true },
  });
  if (!root) throw new GraphQLError("Task not found", { extensions: { code: "NOT_FOUND" } });
  const ids = await subtreeIds(rootTaskId);
  const res = await prisma.task.updateMany({
    where: { id: { in: ids }, status: "cancelled", deletedAt: null },
    data: { status: "assigned", cancelledAt: null },
  });
  return res.count;
}
