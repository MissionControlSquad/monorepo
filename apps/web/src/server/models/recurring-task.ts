import type { RecurringTask, RecurringTaskAssignee } from "@agentcenter/database";
import {
  setRecurringTaskAssignees,
  pauseRecurringTask,
  resumeRecurringTask,
} from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";
import { calculateInitialDueDate, type RecurrenceConfig } from "../recurring-tasks";

class RecurringTaskModel extends Model<RecurringTask> {
  constructor() {
    super(() => prisma.recurringTask);
  }

  /** Set assignees for a recurring task (replace all) — runs in a single transaction. */
  setAssignees(recurringTaskId: string, profileIds: string[]): Promise<RecurringTaskAssignee[]> {
    return setRecurringTaskAssignees(recurringTaskId, profileIds);
  }

  /** Pause a recurring task */
  pause(id: string): Promise<RecurringTask> {
    return pauseRecurringTask(id);
  }

  /** Resume a recurring task, recalculating nextDueAt */
  async resume(id: string): Promise<RecurringTask> {
    const rt = await this.findByIdOrThrow(id);
    const config = rt.recurrenceConfig as unknown as RecurrenceConfig;
    const nextDueAt = calculateInitialDueDate(config, rt.timezone ?? "UTC");
    return resumeRecurringTask(id, nextDueAt);
  }
}

export const recurringTaskModel = new RecurringTaskModel();
