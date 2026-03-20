import { prisma } from "@agentcenter/database";
import { pubsub, PubSubEvent, taskTopic, taskProjectTopic } from "./pubsub";
import { addDays, addWeeks, addMonths } from "date-fns";
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

// ─── Timezone Helpers ───────────────────────────────────────────────

/** Extract date/time components as seen in a specific timezone. */
function getPartsInTz(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const v = (t: Intl.DateTimeFormatPartTypes) => parseInt(parts.find((p) => p.type === t)!.value);
  return {
    year: v("year"),
    month: v("month"),
    day: v("day"),
    hour: v("hour") === 24 ? 0 : v("hour"),
    minute: v("minute"),
  };
}

/** Get the UTC offset in milliseconds for a timezone at a given instant. */
function tzOffsetMs(date: Date, tz: string): number {
  const u = getPartsInTz(date, "UTC");
  const t = getPartsInTz(date, tz);
  const uMs = Date.UTC(u.year, u.month - 1, u.day, u.hour, u.minute);
  const tMs = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute);
  return tMs - uMs;
}

/** Get the day of week (0=Sun, 6=Sat) for a date as seen in a timezone. */
function getDayOfWeekInTz(date: Date, tz: string): number {
  const { year, month, day } = getPartsInTz(date, tz);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Get year/month/day as seen in a timezone. */
function getDateInTz(date: Date, tz: string) {
  const { year, month, day } = getPartsInTz(date, tz);
  return { year, month, day };
}

// ─── Date Calculation ───────────────────────────────────────────────

/**
 * Apply HH:MM time to a date, interpreting the time in the given timezone.
 * Returns a UTC Date that corresponds to the given time in the timezone.
 */
function applyTime(date: Date, time: string, timezone: string = "UTC"): Date {
  const [hours, minutes] = time.split(":").map(Number);

  // Get the calendar date as seen in the target timezone
  const { year, month, day } = getPartsInTz(date, timezone);

  // Create the desired datetime as if it were UTC
  const desiredAsUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

  // Get the offset at this approximate point
  const approx = new Date(desiredAsUtc);
  const offset = tzOffsetMs(approx, timezone);

  // The actual UTC time = desired local time - offset
  const result = new Date(desiredAsUtc - offset);

  // Handle DST transitions: offset may differ at the result time
  const actualOffset = tzOffsetMs(result, timezone);
  if (actualOffset !== offset) {
    return new Date(desiredAsUtc - actualOffset);
  }

  return result;
}

export function calculateNextDueDate(
  config: RecurrenceConfig,
  currentDue: Date,
  timezone: string = "UTC",
): Date {
  const time = config.time ?? "09:00";

  switch (config.type) {
    case "daily": {
      return applyTime(addDays(currentDue, config.interval), time, timezone);
    }

    case "weekly": {
      if (config.daysOfWeek && config.daysOfWeek.length > 0) {
        // Find the next applicable day of week
        const sortedDays = [...config.daysOfWeek].sort((a, b) => a - b);
        const currentDay = getDayOfWeekInTz(currentDue, timezone);
        // Find next day in the same week
        const nextInWeek = sortedDays.find((d) => d > currentDay);
        if (nextInWeek !== undefined) {
          const diff = nextInWeek - currentDay;
          return applyTime(addDays(currentDue, diff), time, timezone);
        }
        // Wrap to next interval's first day
        const weeksToAdd = config.interval;
        const baseDate = addWeeks(currentDue, weeksToAdd);
        const targetDay = sortedDays[0];
        const baseDayOfWeek = getDayOfWeekInTz(baseDate, timezone);
        const daysToTarget = (targetDay - baseDayOfWeek + 7) % 7;
        return applyTime(addDays(baseDate, daysToTarget), time, timezone);
      }
      return applyTime(addWeeks(currentDue, config.interval), time, timezone);
    }

    case "monthly": {
      const nextMonth = addMonths(currentDue, config.interval);
      if (config.dayOfMonth) {
        const { year, month } = getDateInTz(nextMonth, timezone);
        const maxDay = new Date(year, month, 0).getDate();
        const day = Math.min(config.dayOfMonth, maxDay);
        // Build a date for that day in the timezone, then apply time
        const targetDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        return applyTime(targetDate, time, timezone);
      }
      return applyTime(nextMonth, time, timezone);
    }

    default:
      throw new Error(`Unknown recurrence type: ${(config as any).type}`);
  }
}

export function calculateInitialDueDate(
  config: RecurrenceConfig,
  timezone: string = "UTC",
  startFrom?: Date,
): Date {
  const now = startFrom ?? new Date();
  const time = config.time ?? "09:00";

  switch (config.type) {
    case "daily": {
      // Next occurrence is tomorrow (or today if time hasn't passed)
      const todayWithTime = applyTime(now, time, timezone);
      if (todayWithTime > now) return todayWithTime;
      return applyTime(addDays(now, 1), time, timezone);
    }

    case "weekly": {
      if (config.daysOfWeek && config.daysOfWeek.length > 0) {
        const sortedDays = [...config.daysOfWeek].sort((a, b) => a - b);
        const currentDay = getDayOfWeekInTz(now, timezone);
        // Check today or later this week
        for (const day of sortedDays) {
          if (day > currentDay) {
            return applyTime(addDays(now, day - currentDay), time, timezone);
          }
          if (day === currentDay) {
            const todayWithTime = applyTime(now, time, timezone);
            if (todayWithTime > now) return todayWithTime;
          }
        }
        // Next week's first day
        const daysUntilNext = (sortedDays[0] - currentDay + 7) % 7 || 7;
        return applyTime(addDays(now, daysUntilNext), time, timezone);
      }
      // Same day next week
      return applyTime(addWeeks(now, 1), time, timezone);
    }

    case "monthly": {
      if (config.dayOfMonth) {
        const { year, month } = getDateInTz(now, timezone);
        const maxDay = new Date(year, month, 0).getDate();
        const day = Math.min(config.dayOfMonth, maxDay);
        const thisMonthDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        const thisMonth = applyTime(thisMonthDate, time, timezone);
        if (thisMonth > now) return thisMonth;
        const nextMonthDate = addMonths(thisMonthDate, 1);
        const { year: ny, month: nm } = getDateInTz(nextMonthDate, timezone);
        const maxDayNext = new Date(ny, nm, 0).getDate();
        const dayNext = Math.min(config.dayOfMonth, maxDayNext);
        const nextDate = new Date(Date.UTC(ny, nm - 1, dayNext, 12, 0, 0));
        return applyTime(nextDate, time, timezone);
      }
      return applyTime(addMonths(now, 1), time, timezone);
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
  const timezone = rt.timezone ?? "UTC";
  let nextDue = rt.nextDueAt ?? now;
  while (nextDue <= now) {
    nextDue = calculateNextDueDate(config, nextDue, timezone);
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
    const timezone = rt.timezone ?? "UTC";
    let nextDue = calculateNextDueDate(config, rt.nextDueAt!, timezone);
    while (nextDue <= now) {
      nextDue = calculateNextDueDate(config, nextDue, timezone);
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
