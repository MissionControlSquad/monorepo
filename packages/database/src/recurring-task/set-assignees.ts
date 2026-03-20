/**
 * @agentcenter/database - Recurring Task Operations
 *
 * Replace all assignees for a recurring task in a single atomic transaction.
 * Accepts profileIds (not agentIds).
 */

import { prisma } from "../client";
import type { RecurringTaskAssignee } from "@prisma/client";

export async function setRecurringTaskAssignees(
  recurringTaskId: string,
  profileIds: string[],
): Promise<RecurringTaskAssignee[]> {
  return prisma.$transaction(async (tx) => {
    await tx.recurringTaskAssignee.deleteMany({ where: { recurringTaskId } });
    if (profileIds.length === 0) return [];
    await tx.recurringTaskAssignee.createMany({
      data: profileIds.map((profileId) => ({ recurringTaskId, profileId })),
      skipDuplicates: true,
    });
    return tx.recurringTaskAssignee.findMany({ where: { recurringTaskId } });
  });
}
