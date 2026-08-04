/**
 * Routines service (Epic #7). A routine is a reusable workflow doc with immutable revisions,
 * heterogeneous triggers, and run history. Workspace-scoped. A run executes the routine by
 * generating a Task (the same output path recurring-tasks use); richer execution is future work.
 */
import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { isValidCron, nextCronTick } from "@agentcenter/utils";
import type { Routine, RoutineRun, RoutineTrigger } from "@agentcenter/database";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** URL-safe, unguessable public id for a webhook fire URL (rotatable). */
export function generatePublicId(): string {
  return randomUUID().replace(/-/g, "");
}

type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface CreateRoutineInput {
  workspaceId: string;
  name: string;
  definition: unknown;
  description?: string | null;
  timezone?: string | null;
  projectId?: string | null;
  createdByProfileId?: string | null;
  assigneeAgentId?: string | null;
  priority?: TaskPriority | null;
  goalId?: string | null;
}

export async function createRoutine(input: CreateRoutineInput): Promise<Routine> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  return prisma.$transaction(async (tx) => {
    const routine = await tx.routine.create({
      data: {
        workspaceId: input.workspaceId,
        name,
        description: input.description ?? null,
        definition: (input.definition ?? {}) as never,
        timezone: input.timezone ?? "UTC",
        projectId: input.projectId ?? null,
        createdByProfileId: input.createdByProfileId ?? null,
        assigneeAgentId: input.assigneeAgentId ?? null,
        priority: input.priority ?? null,
        goalId: input.goalId ?? null,
        currentVersion: 1,
      },
    });
    await tx.routineRevision.create({
      data: {
        routineId: routine.id,
        version: 1,
        definition: routine.definition as never,
        editedById: input.createdByProfileId ?? null,
      },
    });
    return routine;
  });
}

export interface UpdateRoutineInput {
  name?: string | null;
  description?: string | null;
  definition?: unknown;
  isActive?: boolean | null;
  editedById?: string | null;
  assigneeAgentId?: string | null;
  priority?: TaskPriority | null;
  goalId?: string | null;
  clearAssignee?: boolean;
  clearGoal?: boolean;
}

/** Update a routine; when the definition changes, snapshot an immutable revision (version+1). */
export async function updateRoutine(
  workspaceId: string,
  id: string,
  patch: UpdateRoutineInput,
): Promise<Routine> {
  const routine = await prisma.routine.findFirst({ where: { id, workspaceId } });
  if (!routine) throw new GraphQLError("Routine not found", { extensions: { code: "NOT_FOUND" } });

  const definitionChanged =
    patch.definition !== undefined &&
    JSON.stringify(patch.definition) !== JSON.stringify(routine.definition);

  return prisma.$transaction(async (tx) => {
    const nextVersion = definitionChanged ? routine.currentVersion + 1 : routine.currentVersion;
    const updated = await tx.routine.update({
      where: { id },
      data: {
        ...(patch.name != null ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.isActive != null ? { isActive: patch.isActive } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.clearAssignee
          ? { assigneeAgentId: null }
          : patch.assigneeAgentId != null
            ? { assigneeAgentId: patch.assigneeAgentId }
            : {}),
        ...(patch.clearGoal
          ? { goalId: null }
          : patch.goalId != null
            ? { goalId: patch.goalId }
            : {}),
        ...(definitionChanged
          ? { definition: patch.definition as never, currentVersion: nextVersion }
          : {}),
      },
    });
    if (definitionChanged) {
      await tx.routineRevision.create({
        data: {
          routineId: id,
          version: nextVersion,
          definition: patch.definition as never,
          editedById: patch.editedById ?? null,
        },
      });
    }
    return updated;
  });
}

export async function addRoutineTrigger(
  workspaceId: string,
  routineId: string,
  input: {
    type: "cron" | "manual" | "webhook";
    recurrenceConfig?: unknown;
    cronExpression?: string | null;
    timezone?: string | null;
    nextFireAt?: Date | null;
  },
  now: Date = new Date(),
): Promise<RoutineTrigger> {
  const routine = await prisma.routine.findFirst({ where: { id: routineId, workspaceId } });
  if (!routine) throw new GraphQLError("Routine not found", { extensions: { code: "NOT_FOUND" } });

  // A cron trigger validates its expression and computes its first fire from `now`, so the scanner
  // (tickRoutineTriggers) has a due-time to key off. The trigger's own timezone wins, else the routine's.
  let cronExpression: string | null = null;
  let nextFireAt = input.nextFireAt ?? null;
  const timezone = input.timezone ?? null;
  if (input.type === "cron") {
    const expr = (input.cronExpression ?? "").trim();
    if (!expr || !isValidCron(expr))
      badRequest("cron trigger requires a valid 5-field cron expression");
    cronExpression = expr;
    nextFireAt = nextCronTick(expr, now, timezone ?? routine.timezone ?? "UTC");
  }

  return prisma.routineTrigger.create({
    data: {
      routineId,
      type: input.type,
      recurrenceConfig: (input.recurrenceConfig ?? undefined) as never,
      cronExpression,
      timezone,
      nextFireAt,
      // Only webhook triggers get a public fire id.
      publicId: input.type === "webhook" ? generatePublicId() : null,
    },
  });
}

/** Rotate a webhook trigger's public id (invalidates a leaked URL). */
export async function regenerateTriggerPublicId(
  workspaceId: string,
  triggerId: string,
): Promise<RoutineTrigger> {
  const trigger = await prisma.routineTrigger.findFirst({
    where: { id: triggerId, routine: { workspaceId } },
  });
  if (!trigger) throw new GraphQLError("Trigger not found", { extensions: { code: "NOT_FOUND" } });
  if (trigger.type !== "webhook") badRequest("only webhook triggers have a public id");
  return prisma.routineTrigger.update({
    where: { id: triggerId },
    data: { publicId: generatePublicId() },
  });
}

/**
 * Fire a routine now: create a RoutineRun and drive it queued→running→succeeded (or failed),
 * generating a Task as the run's output. Returns the finished run.
 */
export async function triggerRoutineNow(args: {
  workspaceId: string;
  routineId: string;
  triggeredBy?: "cron" | "manual" | "webhook";
  triggerId?: string | null;
}): Promise<RoutineRun> {
  const routine = await prisma.routine.findFirst({
    where: { id: args.routineId, workspaceId: args.workspaceId },
  });
  if (!routine) throw new GraphQLError("Routine not found", { extensions: { code: "NOT_FOUND" } });

  const run = await prisma.routineRun.create({
    data: {
      routineId: routine.id,
      triggeredBy: args.triggeredBy ?? "manual",
      triggerId: args.triggerId ?? null,
      status: "queued",
    },
  });

  try {
    await prisma.routineRun.update({
      where: { id: run.id },
      data: { status: "running", startedAt: new Date() },
    });
    // Resolve the assignee agent's profile so the generated task lands on the right agent.
    const assigneeProfileId = routine.assigneeAgentId
      ? await getOrCreateAgentProfileId(routine.assigneeAgentId)
      : null;

    const task = await prisma.task.create({
      data: {
        title: routine.name,
        description:
          typeof routine.description === "string" && routine.description
            ? routine.description
            : `Generated by routine "${routine.name}"`,
        ...(routine.projectId ? { projectId: routine.projectId } : {}),
        ...(routine.priority ? { priority: routine.priority } : {}),
        ...(routine.goalId ? { goalId: routine.goalId } : {}),
        ...(assigneeProfileId ? { assignees: { create: { profileId: assigneeProfileId } } } : {}),
      },
    });
    return await prisma.routineRun.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date(), generatedTaskId: task.id },
    });
  } catch (err) {
    return prisma.routineRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

/**
 * Cron scanner (Domain 9 #12) — fire every enabled cron trigger whose nextFireAt has passed. Called
 * from the reap-stale-work cron. For each due trigger it OPTIMISTICALLY CLAIMS the exact due-time
 * (updateMany WHERE nextFireAt = observed) so two overlapping cron invocations can't double-fire, then
 * advances nextFireAt to the next tick and fires the routine. A trigger whose routine is inactive or
 * whose expression became invalid is advanced/parked, never fired. Best-effort per trigger; one bad
 * routine never blocks the rest. Returns how many routines were fired.
 */
export async function tickRoutineTriggers(now: Date = new Date()): Promise<number> {
  const due = await prisma.routineTrigger.findMany({
    where: { type: "cron", isEnabled: true, nextFireAt: { lte: now } },
    include: {
      routine: { select: { id: true, workspaceId: true, isActive: true, timezone: true } },
    },
    take: 200,
  });

  let fired = 0;
  for (const trigger of due) {
    const observed = trigger.nextFireAt;
    if (!observed || !trigger.cronExpression) continue;

    // Advance to the next tick FIRST (compute-and-set), guarded by the observed due-time so a
    // concurrent invocation that already advanced this trigger loses the race and skips it.
    const tz = trigger.timezone ?? trigger.routine.timezone ?? "UTC";
    const next = isValidCron(trigger.cronExpression)
      ? nextCronTick(trigger.cronExpression, now, tz)
      : null;
    const claim = await prisma.routineTrigger.updateMany({
      where: { id: trigger.id, nextFireAt: observed },
      data: { nextFireAt: next },
    });
    if (claim.count === 0) continue; // another invocation claimed this tick

    // Only an active routine actually fires; the schedule still advanced above so it self-heals.
    if (!trigger.routine.isActive) continue;
    try {
      await triggerRoutineNow({
        workspaceId: trigger.routine.workspaceId,
        routineId: trigger.routine.id,
        triggeredBy: "cron",
        triggerId: trigger.id,
      });
      fired++;
    } catch {
      // A failed fire is recorded as a failed RoutineRun by triggerRoutineNow; keep scanning.
    }
  }
  return fired;
}
