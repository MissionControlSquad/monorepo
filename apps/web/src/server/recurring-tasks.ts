import { prisma } from "./prisma";
import { pubsub, PubSubEvent, taskTopic, taskProjectTopic } from "./pubsub";
import { addDays, addWeeks, addMonths, setDate, startOfDay } from "date-fns";
import { taskModel } from "./models/task";
import { isSystemShutdown } from "./system-settings";
import { filterAvailableAssignees } from "./assignment-guard";

// ─── Types ──────────────────────────────────────────────────────────

export interface RecurrenceConfig {
  type: "daily" | "weekly" | "monthly";
  interval: number; // every N days/weeks/months
  daysOfWeek?: number[]; // 0-6 (Sun-Sat), for weekly
  dayOfMonth?: number; // 1-31, for monthly
  time?: string; // "HH:MM", defaults to "09:00"
}

// ─── Validation ─────────────────────────────────────────────────────

export function validateRecurrenceConfig(input: unknown): RecurrenceConfig {
  if (!input || typeof input !== "object") {
    throw new Error("recurrenceConfig must be an object");
  }

  const obj = input as Record<string, unknown>;

  if (!["daily", "weekly", "monthly"].includes(obj.type as string)) {
    throw new Error('recurrenceConfig.type must be "daily", "weekly", or "monthly"');
  }

  const interval = Number(obj.interval);
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error("recurrenceConfig.interval must be a positive integer");
  }

  const config: RecurrenceConfig = {
    type: obj.type as RecurrenceConfig["type"],
    interval,
  };

  if (obj.type === "weekly") {
    if (obj.daysOfWeek !== undefined) {
      if (
        !Array.isArray(obj.daysOfWeek) ||
        obj.daysOfWeek.some((d: unknown) => typeof d !== "number" || d < 0 || d > 6)
      ) {
        throw new Error("recurrenceConfig.daysOfWeek must be an array of numbers 0-6");
      }
      config.daysOfWeek = obj.daysOfWeek as number[];
    }
  }

  if (obj.type === "monthly") {
    if (obj.dayOfMonth !== undefined) {
      const day = Number(obj.dayOfMonth);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error("recurrenceConfig.dayOfMonth must be 1-31");
      }
      config.dayOfMonth = day;
    }
  }

  if (obj.time !== undefined) {
    if (typeof obj.time !== "string" || !/^\d{2}:\d{2}$/.test(obj.time)) {
      throw new Error('recurrenceConfig.time must be in "HH:MM" format');
    }
    config.time = obj.time;
  }

  return config;
}

// ─── Date Calculation ───────────────────────────────────────────────

function applyTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function calculateNextDueDate(config: RecurrenceConfig, currentDue: Date): Date {
  const time = config.time ?? "09:00";

  switch (config.type) {
    case "daily": {
      return applyTime(addDays(currentDue, config.interval), time);
    }

    case "weekly": {
      if (config.daysOfWeek && config.daysOfWeek.length > 0) {
        // Find the next applicable day of week
        const sortedDays = [...config.daysOfWeek].sort((a, b) => a - b);
        const currentDay = currentDue.getDay();
        // Find next day in the same week
        const nextInWeek = sortedDays.find((d) => d > currentDay);
        if (nextInWeek !== undefined) {
          const diff = nextInWeek - currentDay;
          return applyTime(addDays(currentDue, diff), time);
        }
        // Wrap to next interval's first day
        const weeksToAdd = config.interval;
        const baseDate = addWeeks(startOfDay(currentDue), weeksToAdd);
        const targetDay = sortedDays[0];
        const baseDayOfWeek = baseDate.getDay();
        const daysToTarget = (targetDay - baseDayOfWeek + 7) % 7;
        return applyTime(addDays(baseDate, daysToTarget), time);
      }
      return applyTime(addWeeks(currentDue, config.interval), time);
    }

    case "monthly": {
      const nextMonth = addMonths(currentDue, config.interval);
      if (config.dayOfMonth) {
        const maxDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
        const day = Math.min(config.dayOfMonth, maxDay);
        const result = setDate(nextMonth, day);
        return applyTime(result, time);
      }
      return applyTime(nextMonth, time);
    }

    default:
      throw new Error(`Unknown recurrence type: ${(config as any).type}`);
  }
}

export function calculateInitialDueDate(config: RecurrenceConfig, startFrom?: Date): Date {
  const now = startFrom ?? new Date();
  const time = config.time ?? "09:00";

  switch (config.type) {
    case "daily": {
      // Next occurrence is tomorrow (or today if time hasn't passed)
      const todayWithTime = applyTime(now, time);
      if (todayWithTime > now) return todayWithTime;
      return applyTime(addDays(now, 1), time);
    }

    case "weekly": {
      if (config.daysOfWeek && config.daysOfWeek.length > 0) {
        const sortedDays = [...config.daysOfWeek].sort((a, b) => a - b);
        const currentDay = now.getDay();
        // Check today or later this week
        for (const day of sortedDays) {
          if (day > currentDay) {
            return applyTime(addDays(now, day - currentDay), time);
          }
          if (day === currentDay) {
            const todayWithTime = applyTime(now, time);
            if (todayWithTime > now) return todayWithTime;
          }
        }
        // Next week's first day
        const daysUntilNext = (sortedDays[0] - currentDay + 7) % 7 || 7;
        return applyTime(addDays(now, daysUntilNext), time);
      }
      // Same day next week
      return applyTime(addWeeks(now, 1), time);
    }

    case "monthly": {
      if (config.dayOfMonth) {
        const maxDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const day = Math.min(config.dayOfMonth, maxDay);
        const thisMonth = applyTime(setDate(now, day), time);
        if (thisMonth > now) return thisMonth;
        const nextMonth = addMonths(now, 1);
        const maxDayNext = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
        return applyTime(setDate(nextMonth, Math.min(config.dayOfMonth, maxDayNext)), time);
      }
      return applyTime(addMonths(now, 1), time);
    }

    default:
      throw new Error(`Unknown recurrence type: ${(config as any).type}`);
  }
}

// ─── Manual Trigger ─────────────────────────────────────────────────

/**
 * Manually trigger a single task creation from a recurring task blueprint.
 * Only creates ONE task (the latest), even if multiple dates were missed.
 * Advances nextDueAt to the next future occurrence.
 */
export async function triggerRecurringTaskNow(recurringTaskId: string): Promise<void> {
  if (await isSystemShutdown()) {
    throw new Error("System is in shutdown mode. Cannot trigger recurring tasks.");
  }

  const rt = await prisma.recurringTask.findUniqueOrThrow({
    where: { id: recurringTaskId },
    include: { assignees: true },
  });

  if (rt.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: rt.projectId },
      select: { status: true, shutdownActive: true },
    });
    if (project?.status === "archived") {
      throw new Error("This project is archived. Cannot trigger recurring tasks.");
    }
    if (project?.shutdownActive) {
      throw new Error("This project is paused. Cannot trigger recurring tasks.");
    }
  }

  const config = rt.recurrenceConfig as unknown as RecurrenceConfig;
  const now = new Date();

  // Filter out assignees whose agent is on vacation
  const availableAssignees = await filterAvailableAssignees(rt.assignees);

  // Create one task instance from the blueprint
  const task = await taskModel.create({
    data: {
      title: rt.title,
      description: rt.description,
      status: rt.status,
      priority: rt.priority ?? undefined,
      tags: rt.tags,
      projectId: rt.projectId ?? undefined,
      createdByProfileId: rt.createdByProfileId ?? undefined,
      recurringTaskId: rt.id,
      dueDate: now,
      assignees: {
        create: availableAssignees.map((a) => ({ profileId: a.profileId })),
      },
    },
    include: { assignees: { include: { profile: true } } },
  });

  // Advance nextDueAt to the next future date, skipping any missed dates
  let nextDue = rt.nextDueAt ?? now;
  while (nextDue <= now) {
    nextDue = calculateNextDueDate(config, nextDue);
  }

  await prisma.recurringTask.update({
    where: { id: rt.id },
    data: {
      nextDueAt: nextDue,
      lastGeneratedAt: now,
    },
  });

  // Emit events
  await taskModel.emitCreated(task, {
    createdBy: undefined,
    creatorName: undefined,
    assigneeIds: rt.assignees.map((a) => a.profileId).filter(Boolean),
    fromDashboard: false,
  });

  const taskPayload = { taskId: task.id, projectId: rt.projectId ?? undefined };
  pubsub.publish(taskTopic(task.id), taskPayload);
  if (rt.projectId) pubsub.publish(taskProjectTopic(rt.projectId), taskPayload);
  pubsub.publish(PubSubEvent.TASK.UPDATED, taskPayload);
}

// ─── Lazy Generation ────────────────────────────────────────────────

/**
 * Generate task instances from recurring tasks whose nextDueAt <= now.
 * Called lazily when tasks are listed (same pattern as generateDueDateReminders).
 * Returns the number of tasks generated.
 */
export async function generateRecurringTasks(opts?: { projectId?: string }): Promise<number> {
  if (await isSystemShutdown()) return 0;

  const now = new Date();

  const where: Record<string, unknown> = {
    isActive: true,
    nextDueAt: { not: null, lte: now },
    // Exclude recurring tasks belonging to archived or shutdown projects
    OR: [{ projectId: null }, { project: { status: "active", shutdownActive: false } }],
  };

  if (opts?.projectId) {
    where.projectId = opts.projectId;
  }

  const recurringTasks = await prisma.recurringTask.findMany({
    where,
    include: {
      assignees: true,
    },
  });

  if (recurringTasks.length === 0) return 0;

  let created = 0;

  for (const rt of recurringTasks) {
    const config = rt.recurrenceConfig as unknown as RecurrenceConfig;

    // Filter out assignees whose agent is on vacation
    const availableAssignees = await filterAvailableAssignees(rt.assignees);

    // Create a task instance from the blueprint
    const task = await taskModel.create({
      data: {
        title: rt.title,
        description: rt.description,
        status: rt.status,
        priority: rt.priority ?? undefined,
        tags: rt.tags,
        projectId: rt.projectId ?? undefined,
        createdByProfileId: rt.createdByProfileId ?? undefined,
        recurringTaskId: rt.id,
        dueDate: rt.nextDueAt,
        assignees: {
          create: availableAssignees.map((a) => ({ profileId: a.profileId })),
        },
      },
      include: { assignees: { include: { profile: true } } },
    });

    // Advance nextDueAt to the next future date, skipping any missed dates
    let nextDue = calculateNextDueDate(config, rt.nextDueAt!);
    while (nextDue <= now) {
      nextDue = calculateNextDueDate(config, nextDue);
    }

    await prisma.recurringTask.update({
      where: { id: rt.id },
      data: {
        nextDueAt: nextDue,
        lastGeneratedAt: now,
      },
    });

    // Emit events
    await taskModel.emitCreated(task, {
      createdBy: undefined,
      creatorName: undefined,
      assigneeIds: rt.assignees.map((a) => a.profileId).filter(Boolean),
      fromDashboard: false,
    });

    pubsub.publish(PubSubEvent.TASK.UPDATED, {
      taskId: task.id,
      projectId: rt.projectId ?? undefined,
    });

    created++;
  }

  return created;
}
