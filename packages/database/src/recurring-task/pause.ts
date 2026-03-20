/**
 * @agentcenter/database - Recurring Task Operations
 *
 * Pause a recurring task by setting isActive to false.
 */

import { prisma } from "../client";
import type { RecurringTask } from "@prisma/client";

export async function pauseRecurringTask(id: string): Promise<RecurringTask> {
  return prisma.recurringTask.update({
    where: { id },
    data: { isActive: false },
  });
}
