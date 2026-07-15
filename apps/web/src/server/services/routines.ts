/**
 * Routines service (Epic #7). A routine is a reusable workflow doc with immutable revisions,
 * heterogeneous triggers, and run history. Workspace-scoped. A run executes the routine by
 * generating a Task (the same output path recurring-tasks use); richer execution is future work.
 */
import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
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
    nextFireAt?: Date | null;
  },
): Promise<RoutineTrigger> {
  const routine = await prisma.routine.findFirst({ where: { id: routineId, workspaceId } });
  if (!routine) throw new GraphQLError("Routine not found", { extensions: { code: "NOT_FOUND" } });
  return prisma.routineTrigger.create({
    data: {
      routineId,
      type: input.type,
      recurrenceConfig: (input.recurrenceConfig ?? undefined) as never,
      nextFireAt: input.nextFireAt ?? null,
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
