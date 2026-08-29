/**
 * Routines service (Epic #7). A routine is a reusable workflow doc with immutable revisions,
 * heterogeneous triggers, and run history. Workspace-scoped. A run executes the routine by
 * generating a Task (the same output path recurring-tasks use); richer execution is future work.
 */
import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { isValidCron, nextCronTick, FLAG_KEYS } from "@agentcenter/utils";
import { isFeatureEnabled } from "@/server/feature-flags";
import { resolveSchedulingSuppression } from "./agent-wakeups";
import type { Routine, RoutineRun, RoutineTrigger } from "@agentcenter/database";
import { badRequest } from "./service-errors";

// ─── §3 #11 (2) routine scheduling policies ───────────────────────────
export const CONCURRENCY_POLICIES = ["allow", "skip", "queue"] as const;
export const CATCH_UP_POLICIES = ["skip", "run_once"] as const;
export type ConcurrencyPolicy = (typeof CONCURRENCY_POLICIES)[number];
export type CatchUpPolicy = (typeof CATCH_UP_POLICIES)[number];

function coerceConcurrencyPolicy(v: string | null | undefined): ConcurrencyPolicy {
  if (v && (CONCURRENCY_POLICIES as readonly string[]).includes(v)) return v as ConcurrencyPolicy;
  if (v != null && v !== "")
    badRequest(`concurrencyPolicy must be one of: ${CONCURRENCY_POLICIES.join(", ")}`);
  return "allow";
}
function coerceCatchUpPolicy(v: string | null | undefined): CatchUpPolicy {
  if (v && (CATCH_UP_POLICIES as readonly string[]).includes(v)) return v as CatchUpPolicy;
  if (v != null && v !== "")
    badRequest(`catchUpPolicy must be one of: ${CATCH_UP_POLICIES.join(", ")}`);
  return "skip";
}

/** Is a prior run of this routine still active (queued or running)? Drives concurrencyPolicy. */
async function hasActiveRoutineRun(routineId: string): Promise<boolean> {
  const active = await prisma.routineRun.count({
    where: { routineId, status: { in: ["queued", "running"] } },
  });
  return active > 0;
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
    // §3 #11 (2) — overlap + missed-window policies (PIPELINES_ROUTINES-gated at scan time).
    concurrencyPolicy?: string | null;
    catchUpPolicy?: string | null;
  },
  now: Date = new Date(),
): Promise<RoutineTrigger> {
  const routine = await prisma.routine.findFirst({ where: { id: routineId, workspaceId } });
  if (!routine) throw new GraphQLError("Routine not found", { extensions: { code: "NOT_FOUND" } });

  // Validate the scheduling policies up front (rejects an unknown value rather than silently defaulting).
  const concurrencyPolicy = coerceConcurrencyPolicy(input.concurrencyPolicy);
  const catchUpPolicy = coerceCatchUpPolicy(input.catchUpPolicy);

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
      concurrencyPolicy,
      catchUpPolicy,
      // Only webhook triggers get a public fire id.
      publicId: input.type === "webhook" ? generatePublicId() : null,
    },
  });
}

/**
 * §3 #11 (2) — update a trigger's scheduling policies (concurrencyPolicy / catchUpPolicy). Workspace-
 * scoped; validates each value. Exposed so a routine settings surface can tune overlap/catch-up behavior
 * without recreating the trigger.
 */
export async function updateRoutineTriggerPolicies(
  workspaceId: string,
  triggerId: string,
  patch: { concurrencyPolicy?: string | null; catchUpPolicy?: string | null },
): Promise<RoutineTrigger> {
  const trigger = await prisma.routineTrigger.findFirst({
    where: { id: triggerId, routine: { workspaceId } },
  });
  if (!trigger) throw new GraphQLError("Trigger not found", { extensions: { code: "NOT_FOUND" } });
  return prisma.routineTrigger.update({
    where: { id: triggerId },
    data: {
      ...(patch.concurrencyPolicy !== undefined
        ? { concurrencyPolicy: coerceConcurrencyPolicy(patch.concurrencyPolicy) }
        : {}),
      ...(patch.catchUpPolicy !== undefined
        ? { catchUpPolicy: coerceCatchUpPolicy(patch.catchUpPolicy) }
        : {}),
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
 * Execute an already-persisted RoutineRun: drive it running→succeeded (or failed), generating a Task as
 * the run's output. Shared by the immediate path ({@link triggerRoutineNow}) and the deferred/queued
 * path (a `concurrencyPolicy: "queue"` run drained by {@link tickRoutineTriggers}).
 */
async function executeRoutineRun(routine: Routine, run: RoutineRun): Promise<RoutineRun> {
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
  return executeRoutineRun(routine, run);
}

/**
 * Drain deferred (queued) RoutineRuns left by a `concurrencyPolicy: "queue"` overlap. Runs at most one
 * queued run per routine per scan, and only when that routine currently has NO running run — so a
 * queued occurrence executes once the prior run finished, never overlapping. PIPELINES_ROUTINES-gated.
 */
async function drainDeferredRoutineRuns(now: Date): Promise<void> {
  const queuedRuns = await prisma.routineRun.findMany({
    where: { status: "queued", triggeredBy: "cron" },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  const handledRoutine = new Set<string>();
  for (const run of queuedRuns) {
    if (handledRoutine.has(run.routineId)) continue; // one per routine per scan
    const running = await prisma.routineRun.count({
      where: { routineId: run.routineId, status: "running" },
    });
    if (running > 0) continue; // routine still busy — leave the deferred run queued
    const routine = await prisma.routine.findUnique({ where: { id: run.routineId } });
    if (!routine || !routine.isActive) continue;
    // Honor the unified pause (§3 #11.3) for the deferred run too.
    const suppression = await resolveSchedulingSuppression({
      projectId: routine.projectId,
      agentId: routine.assigneeAgentId,
    });
    if (suppression.suppressed) continue;
    handledRoutine.add(run.routineId);
    // Atomically claim the queued run so a concurrent scan can't double-execute it.
    const claimed = await prisma.routineRun.updateMany({
      where: { id: run.id, status: "queued" },
      data: { status: "running", startedAt: now },
    });
    if (claimed.count === 0) continue;
    try {
      await executeRoutineRun(routine, { ...run, status: "running" });
    } catch {
      // executeRoutineRun records a failed RoutineRun in its own catch; keep draining.
    }
  }
}

/**
 * Cron scanner (Domain 9 #12) — fire every enabled cron trigger whose nextFireAt has passed. Called
 * from the reap-stale-work cron. For each due trigger it OPTIMISTICALLY CLAIMS the exact due-time
 * (updateMany WHERE nextFireAt = observed) so two overlapping cron invocations can't double-fire, then
 * advances nextFireAt to the next tick and fires the routine. A trigger whose routine is inactive or
 * whose expression became invalid is advanced/parked, never fired. Best-effort per trigger; one bad
 * routine never blocks the rest. Returns how many routines were fired.
 *
 * §3 #11 — three refinements layer in here:
 *   (2, PIPELINES_ROUTINES-gated) concurrencyPolicy: when a prior run of the routine is still active at
 *       the due moment — "allow" fires anyway; "skip" drops this occurrence; "queue" defers it as a
 *       queued RoutineRun that a later scan drains once the routine is idle (drainDeferredRoutineRuns).
 *   (2, PIPELINES_ROUTINES-gated) catchUpPolicy: when the trigger is due only because ≥1 whole tick
 *       window was missed (downtime) — "skip" advances the schedule WITHOUT firing; "run_once" fires
 *       once for the backlog. An on-time tick fires under either policy. The schedule is ALWAYS advanced.
 *   (3) unified pause: resolveSchedulingSuppression() suppresses a fire whose routine's project (or the
 *       system/instance) is paused — the schedule still advances, it just doesn't fire while paused.
 *
 * HOW TO TEST:
 *   • concurrencyPolicy "skip": create a RUNNING RoutineRun for the routine, then tick a due trigger →
 *     no new run/task is created (no overlap). "queue" instead leaves a queued RoutineRun that a later
 *     tick (once the running one is gone) executes exactly once.
 *   • catchUpPolicy "skip": arm a cron trigger with nextFireAt several windows in the past, then tick →
 *     nextFireAt advances but NO run fires. "run_once" fires exactly one run for the same backlog.
 *   • unified pause: pause the routine's project (project.shutdownActive=true) → a due tick advances the
 *     schedule but fires nothing.
 */
export async function tickRoutineTriggers(now: Date = new Date()): Promise<number> {
  const policiesOn = await isFeatureEnabled(FLAG_KEYS.PIPELINES_ROUTINES);

  // First, drain any deferred (queued) runs from a prior "queue" overlap now that routines may be idle.
  if (policiesOn) await drainDeferredRoutineRuns(now);

  const due = await prisma.routineTrigger.findMany({
    where: { type: "cron", isEnabled: true, nextFireAt: { lte: now } },
    include: {
      routine: {
        select: {
          id: true,
          workspaceId: true,
          isActive: true,
          timezone: true,
          projectId: true,
          assigneeAgentId: true,
        },
      },
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
    const exprValid = isValidCron(trigger.cronExpression);
    const next = exprValid ? nextCronTick(trigger.cronExpression, now, tz) : null;
    const claim = await prisma.routineTrigger.updateMany({
      where: { id: trigger.id, nextFireAt: observed },
      data: { nextFireAt: next },
    });
    if (claim.count === 0) continue; // another invocation claimed this tick

    // Only an active routine actually fires; the schedule still advanced above so it self-heals.
    if (!trigger.routine.isActive) continue;

    // §3 #11 (3) — unified pause: never fire while the routine's project/system/instance is paused. The
    // schedule already advanced, so it resumes cleanly once unpaused.
    const suppression = await resolveSchedulingSuppression({
      projectId: trigger.routine.projectId,
      agentId: trigger.routine.assigneeAgentId,
    });
    if (suppression.suppressed) continue;

    if (policiesOn) {
      // §3 #11 (2) catchUpPolicy — is this fire only due to a MISSED (downtime) window? True when the
      // tick immediately after the observed due-time already elapsed, i.e. ≥1 full window was skipped.
      const nextAfterObserved = exprValid
        ? nextCronTick(trigger.cronExpression, observed, tz)
        : null;
      const missedWindow = nextAfterObserved != null && nextAfterObserved <= now;
      if (missedWindow && trigger.catchUpPolicy === "skip") continue; // drop the backlog, don't fire

      // §3 #11 (2) concurrencyPolicy — overlap handling when a prior run is still active.
      if (
        trigger.concurrencyPolicy !== "allow" &&
        (await hasActiveRoutineRun(trigger.routine.id))
      ) {
        if (trigger.concurrencyPolicy === "skip") continue; // drop this occurrence
        // "queue": defer as a queued RoutineRun for a later idle scan to execute (not counted as fired).
        await prisma.routineRun.create({
          data: {
            routineId: trigger.routine.id,
            triggeredBy: "cron",
            triggerId: trigger.id,
            status: "queued",
          },
        });
        continue;
      }
    }

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
