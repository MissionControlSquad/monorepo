import type { RecurringTask, RecurringTaskAssignee } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";
import { calculateInitialDueDate, type RecurrenceConfig } from "../recurring-tasks";

class RecurringTaskModel extends Model<RecurringTask> {
  constructor() {
    super(() => prisma.recurringTask);
  }

  /** Set assignees for a recurring task (replace all) — runs in a single transaction. */
  async setAssignees(
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

  /** Pause a recurring task */
  async pause(id: string): Promise<RecurringTask> {
    return prisma.recurringTask.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Resume a recurring task, recalculating nextDueAt */
  async resume(id: string): Promise<RecurringTask> {
    const rt = await this.findByIdOrThrow(id);
    const config = rt.recurrenceConfig as unknown as RecurrenceConfig;
    const nextDueAt = calculateInitialDueDate(config, rt.timezone ?? "UTC");

    return prisma.recurringTask.update({
      where: { id },
      data: { isActive: true, nextDueAt },
    });
  }
}

export const recurringTaskModel = new RecurringTaskModel();
