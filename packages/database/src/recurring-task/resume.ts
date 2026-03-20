/**
 * @agentcenter/database - Recurring Task Operations
 *
 * Resume a recurring task and set its next due date.
 * The caller is responsible for computing nextDueAt from the recurrence config.
 */

import { prisma } from "../client";
import type { RecurringTask } from "@prisma/client";

export async function resumeRecurringTask(id: string, nextDueAt: Date): Promise<RecurringTask> {
  return prisma.recurringTask.update({
    where: { id },
    data: { isActive: true, nextDueAt },
  });
}
