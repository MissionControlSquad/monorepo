/** @agentcenter/database - Activity Operations
 * Query helpers for activity feed pagination.
 */

import { prisma } from "../client";

/** Get the createdAt cursor for a given activity ID. */
export async function getActivityCursor(id: string) {
  return prisma.activity.findFirst({
    where: { id },
    select: { createdAt: true },
  });
}

/** List a page of activities with optional cursor-based pagination. */
export async function listActivitiesPage(
  where: Record<string, unknown>,
  opts: { take: number; include?: Record<string, unknown> },
) {
  return prisma.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.take,
    include: opts.include as any,
  });
}
