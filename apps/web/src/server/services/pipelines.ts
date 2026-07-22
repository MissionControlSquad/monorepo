/**
 * Pipelines service (Epic #7). Multi-stage case workflows: cases claim atomically, transition only
 * to strictly-higher-order stages, and every action appends an immutable PipelineCaseEvent (the
 * StatusHistory convention). Workspace-scoped.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type {
  Pipeline,
  PipelineStage,
  PipelineCase,
  PipelineCaseEventType,
} from "@agentcenter/database";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}
function conflict(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "CONFLICT" } });
}

/** Pure: a case may only move to a strictly higher-order stage. Unit-testable. */
export function isValidTransition(fromOrder: number, toOrder: number): boolean {
  return toOrder > fromOrder;
}

function appendEvent(
  caseId: string,
  type: PipelineCaseEventType,
  extra: {
    fromStageId?: string | null;
    toStageId?: string | null;
    actorProfileId?: string | null;
    note?: string | null;
  } = {},
) {
  return prisma.pipelineCaseEvent.create({
    data: {
      caseId,
      type,
      fromStageId: extra.fromStageId ?? null,
      toStageId: extra.toStageId ?? null,
      actorProfileId: extra.actorProfileId ?? null,
      note: extra.note ?? null,
    },
  });
}

export async function createPipeline(input: {
  workspaceId: string;
  name: string;
  description?: string | null;
  projectId?: string | null;
  sequentialOnly?: boolean;
}): Promise<Pipeline> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  return prisma.pipeline.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      sequentialOnly: input.sequentialOnly ?? false,
    },
  });
}

/** Toggle the sequential-only transition rule on a pipeline. */
export async function setPipelineSequential(
  workspaceId: string,
  pipelineId: string,
  sequentialOnly: boolean,
): Promise<Pipeline> {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) notFound("Pipeline");
  return prisma.pipeline.update({ where: { id: pipeline.id }, data: { sequentialOnly } });
}

export async function addPipelineStage(
  workspaceId: string,
  pipelineId: string,
  input: {
    name: string;
    order: number;
    isReviewStage?: boolean;
    requireApproval?: boolean;
    slaMinutes?: number | null;
  },
): Promise<PipelineStage> {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) notFound("Pipeline");
  if (!Number.isInteger(input.order)) badRequest("order must be an integer");
  const dup = await prisma.pipelineStage.findFirst({ where: { pipelineId, order: input.order } });
  if (dup) badRequest(`a stage already exists at order ${input.order}`);
  return prisma.pipelineStage.create({
    data: {
      pipelineId,
      name: input.name.trim(),
      order: input.order,
      isReviewStage: input.isReviewStage ?? false,
      requireApproval: input.requireApproval ?? false,
      slaMinutes: input.slaMinutes ?? null,
    },
  });
}

/** Edit a stage's config. Order is immutable here (it anchors transitions + the unique index). */
export async function updatePipelineStage(
  workspaceId: string,
  stageId: string,
  patch: {
    name?: string | null;
    isReviewStage?: boolean | null;
    requireApproval?: boolean | null;
    slaMinutes?: number | null;
    clearSla?: boolean;
  },
): Promise<PipelineStage> {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { workspaceId } },
  });
  if (!stage) notFound("Stage");
  const name = patch.name?.trim();
  if (patch.name != null && !name) badRequest("name cannot be empty");
  return prisma.pipelineStage.update({
    where: { id: stage.id },
    data: {
      ...(name ? { name } : {}),
      ...(patch.isReviewStage != null ? { isReviewStage: patch.isReviewStage } : {}),
      ...(patch.requireApproval != null ? { requireApproval: patch.requireApproval } : {}),
      ...(patch.clearSla
        ? { slaMinutes: null }
        : patch.slaMinutes != null
          ? { slaMinutes: patch.slaMinutes }
          : {}),
    },
  });
}

/** Remove a stage. Refuses if any case currently sits on it (would orphan live work). */
export async function deletePipelineStage(workspaceId: string, stageId: string): Promise<boolean> {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { workspaceId } },
    select: { id: true },
  });
  if (!stage) notFound("Stage");
  const onStage = await prisma.pipelineCase.count({ where: { currentStageId: stage.id } });
  if (onStage > 0) badRequest("cannot delete a stage that has cases on it; move them first");
  await prisma.pipelineStage.delete({ where: { id: stage.id } });
  return true;
}

/** Create a case, placing it at the pipeline's first (lowest-order) stage. */
export async function createCase(
  workspaceId: string,
  pipelineId: string,
  input: { title: string; payload?: unknown },
): Promise<PipelineCase> {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) notFound("Pipeline");
  const first = await prisma.pipelineStage.findFirst({
    where: { pipelineId },
    orderBy: { order: "asc" },
  });
  const c = await prisma.pipelineCase.create({
    data: {
      pipelineId,
      title: input.title.trim(),
      payload: (input.payload ?? undefined) as never,
      currentStageId: first?.id ?? null,
      status: "open",
      enteredStageAt: new Date(),
    },
  });
  await appendEvent(c.id, "created", { toStageId: first?.id ?? null });
  return c;
}

/** Atomically claim an OPEN case; concurrent claims resolve to exactly one winner. */
export async function claimCase(
  workspaceId: string,
  caseId: string,
  profileId: string,
): Promise<PipelineCase> {
  const exists = await prisma.pipelineCase.findFirst({
    where: { id: caseId, pipeline: { workspaceId } },
    select: { id: true },
  });
  if (!exists) notFound("Case");
  // The atomic guard: only a row still `open` transitions to `claimed`.
  const res = await prisma.pipelineCase.updateMany({
    where: { id: caseId, status: "open" },
    data: { status: "claimed", claimedByProfileId: profileId, claimedAt: new Date() },
  });
  if (res.count === 0) conflict("Case is already claimed or not open");
  await appendEvent(caseId, "claimed", { actorProfileId: profileId });
  return prisma.pipelineCase.findUniqueOrThrow({ where: { id: caseId } });
}

/**
 * Release a claimed case back to `open` so someone else can pick it up. Only the current claimer or
 * an admin may release — this backs both a manual "give it back" and reclaiming an expired lease.
 */
export async function releaseCase(args: {
  workspaceId: string;
  caseId: string;
  actorProfileId: string;
  actorIsAdmin?: boolean;
}): Promise<PipelineCase> {
  const c = await prisma.pipelineCase.findFirst({
    where: { id: args.caseId, pipeline: { workspaceId: args.workspaceId } },
    select: { id: true, status: true, claimedByProfileId: true },
  });
  if (!c) notFound("Case");
  if (c.status !== "claimed") badRequest("only a claimed case can be released");
  if (c.claimedByProfileId !== args.actorProfileId && !args.actorIsAdmin)
    badRequest("only the claimer or an admin can release this case");
  const updated = await prisma.pipelineCase.update({
    where: { id: c.id },
    data: { status: "open", claimedByProfileId: null, claimedAt: null },
  });
  await appendEvent(c.id, "released", { actorProfileId: args.actorProfileId });
  return updated;
}

/** Append a free-text comment to a case's timeline (a `commented` event). */
export async function commentCase(args: {
  workspaceId: string;
  caseId: string;
  actorProfileId: string;
  note: string;
}): Promise<PipelineCase> {
  const note = args.note.trim();
  if (!note) badRequest("comment cannot be empty");
  const c = await prisma.pipelineCase.findFirst({
    where: { id: args.caseId, pipeline: { workspaceId: args.workspaceId } },
    select: { id: true },
  });
  if (!c) notFound("Case");
  await appendEvent(c.id, "commented", { actorProfileId: args.actorProfileId, note });
  return prisma.pipelineCase.findUniqueOrThrow({ where: { id: c.id } });
}

export interface StaleClaim {
  caseId: string;
  title: string;
  claimedByProfileId: string | null;
  minutesClaimed: number;
  leaseMinutes: number;
}

/**
 * Cases claimed longer than `leaseMinutes` ago and still not advanced — an expired claim lease. These
 * are stuck on someone who claimed but stalled; surfacing them lets an operator reclaim (release) them.
 */
export async function staleClaimedCases(
  workspaceId: string,
  leaseMinutes: number,
  pipelineId?: string | null,
  now: Date = new Date(),
): Promise<StaleClaim[]> {
  const cutoff = new Date(now.getTime() - leaseMinutes * 60000);
  const cases = await prisma.pipelineCase.findMany({
    where: {
      pipeline: { workspaceId, ...(pipelineId ? { id: pipelineId } : {}) },
      status: "claimed",
      claimedAt: { lt: cutoff },
    },
    orderBy: { claimedAt: "asc" },
  });
  return cases.map((c) => ({
    caseId: c.id,
    title: c.title,
    claimedByProfileId: c.claimedByProfileId,
    minutesClaimed: c.claimedAt ? Math.floor((now.getTime() - c.claimedAt.getTime()) / 60000) : 0,
    leaseMinutes,
  }));
}

export async function transitionCase(args: {
  workspaceId: string;
  caseId: string;
  toStageId: string;
  actorProfileId?: string | null;
  actorIsAdmin?: boolean;
  note?: string | null;
}): Promise<PipelineCase> {
  const c = await prisma.pipelineCase.findFirst({
    where: { id: args.caseId, pipeline: { workspaceId: args.workspaceId } },
    include: { currentStage: true, pipeline: { select: { sequentialOnly: true } } },
  });
  if (!c) notFound("Case");
  const toStage = await prisma.pipelineStage.findFirst({
    where: { id: args.toStageId, pipelineId: c.pipelineId },
  });
  if (!toStage) badRequest("target stage is not in this case's pipeline");

  const fromOrder = c.currentStage?.order ?? -1;
  if (!isValidTransition(fromOrder, toStage.order))
    badRequest("a case may only move to a higher-order stage");

  // Sequential-only automation: the target must be the IMMEDIATELY next stage (no skipping ahead).
  if (c.pipeline.sequentialOnly) {
    const nextStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: c.pipelineId, order: { gt: fromOrder } },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (!nextStage || nextStage.id !== toStage.id)
      badRequest("this pipeline requires advancing one stage at a time");
  }

  // Approval gate: a case can only LEAVE a requireApproval stage if the actor is an admin.
  if (c.currentStage?.requireApproval && !args.actorIsAdmin)
    badRequest("this stage requires an admin approval to advance");

  const [updated] = await prisma.$transaction([
    prisma.pipelineCase.update({
      where: { id: c.id },
      data: {
        currentStageId: toStage.id,
        enteredStageAt: new Date(),
        status: toStage.isReviewStage ? "in_review" : "transitioned",
      },
    }),
    prisma.pipelineCaseEvent.create({
      data: {
        caseId: c.id,
        type: "transitioned",
        fromStageId: c.currentStageId,
        toStageId: toStage.id,
        actorProfileId: args.actorProfileId ?? null,
        note: args.note ?? null,
      },
    }),
  ]);
  return updated;
}

/** Break a case down into a linked Task (breakdown target). */
export async function breakdownCase(args: {
  workspaceId: string;
  caseId: string;
  title: string;
  description: string;
  actorProfileId?: string | null;
}): Promise<{ case: PipelineCase; taskId: string }> {
  const c = await prisma.pipelineCase.findFirst({
    where: { id: args.caseId, pipeline: { workspaceId: args.workspaceId } },
  });
  if (!c) notFound("Case");
  const task = await prisma.task.create({
    data: { title: args.title.trim(), description: args.description },
  });
  const updated = await prisma.pipelineCase.update({
    where: { id: c.id },
    data: { linkedTaskId: task.id },
  });
  await appendEvent(c.id, "breakdown", { actorProfileId: args.actorProfileId ?? null });
  await appendEvent(c.id, "linked_task", {
    actorProfileId: args.actorProfileId ?? null,
    note: task.id,
  });
  return { case: updated, taskId: task.id };
}

export async function rejectCase(args: {
  workspaceId: string;
  caseId: string;
  actorProfileId?: string | null;
  note?: string | null;
}): Promise<PipelineCase> {
  const c = await prisma.pipelineCase.findFirst({
    where: { id: args.caseId, pipeline: { workspaceId: args.workspaceId } },
    select: { id: true },
  });
  if (!c) notFound("Case");
  const updated = await prisma.pipelineCase.update({
    where: { id: c.id },
    data: { status: "rejected" },
  });
  await appendEvent(c.id, "rejected", {
    actorProfileId: args.actorProfileId ?? null,
    note: args.note ?? null,
  });
  return updated;
}

/** Cases sitting on a review stage — the review inbox. */
export function reviewCases(workspaceId: string, pipelineId?: string | null) {
  return prisma.pipelineCase.findMany({
    where: {
      pipeline: { workspaceId, ...(pipelineId ? { id: pipelineId } : {}) },
      currentStage: { isReviewStage: true },
      status: { notIn: ["done", "rejected"] },
    },
    orderBy: { enteredStageAt: "asc" },
  });
}

export interface StaleCase {
  caseId: string;
  title: string;
  stageId: string;
  minutesInStage: number;
  slaMinutes: number;
}

/** Cases that have exceeded their current stage's slaMinutes (liveness/health). */
export async function computePipelineHealth(
  workspaceId: string,
  pipelineId: string,
  now: Date = new Date(),
): Promise<StaleCase[]> {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) notFound("Pipeline");
  const cases = await prisma.pipelineCase.findMany({
    where: { pipelineId, status: { notIn: ["done", "rejected"] } },
    include: { currentStage: true },
  });
  const stale: StaleCase[] = [];
  for (const c of cases) {
    const sla = c.currentStage?.slaMinutes;
    if (!c.currentStage || sla == null) continue;
    const minutesInStage = (now.getTime() - c.enteredStageAt.getTime()) / 60000;
    if (minutesInStage > sla) {
      stale.push({
        caseId: c.id,
        title: c.title,
        stageId: c.currentStage.id,
        minutesInStage: Math.floor(minutesInStage),
        slaMinutes: sla,
      });
    }
  }
  return stale;
}

export interface PipelineStats {
  activeCount: number;
  doneCount: number;
  rejectedCount: number;
  staleCount: number;
  /** Cases that reached `done` in the last 24h (throughput). */
  completedLast24h: number;
  /** Active-case distribution across stages, most-loaded first. */
  byStage: { stageId: string; stageName: string; count: number }[];
}

/**
 * Aggregate health metrics for a pipeline (parity #101) — the summary that complements the
 * per-case stale list: active/done/rejected counts, SLA-breach (stale) count, recent throughput,
 * and the active-case distribution per stage.
 */
export async function computePipelineStats(
  workspaceId: string,
  pipelineId: string,
  now: Date = new Date(),
): Promise<PipelineStats> {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) notFound("Pipeline");

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [byStatus, activeCases, completedLast24h, stages] = await Promise.all([
    prisma.pipelineCase.groupBy({ by: ["status"], where: { pipelineId }, _count: { _all: true } }),
    prisma.pipelineCase.findMany({
      where: { pipelineId, status: { notIn: ["done", "rejected"] } },
      include: { currentStage: true },
    }),
    prisma.pipelineCase.count({ where: { pipelineId, status: "done", updatedAt: { gte: since } } }),
    prisma.pipelineStage.findMany({ where: { pipelineId }, select: { id: true, name: true } }),
  ]);

  const statusCount = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const doneCount = statusCount("done");
  const rejectedCount = statusCount("rejected");
  const activeCount = activeCases.length;

  let staleCount = 0;
  const perStage = new Map<string, number>();
  for (const c of activeCases) {
    const stageId = c.currentStageId;
    if (stageId) perStage.set(stageId, (perStage.get(stageId) ?? 0) + 1);
    const sla = c.currentStage?.slaMinutes;
    if (sla != null && (now.getTime() - c.enteredStageAt.getTime()) / 60000 > sla) staleCount++;
  }

  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const byStage = [...perStage.entries()]
    .map(([stageId, count]) => ({ stageId, stageName: stageName.get(stageId) ?? stageId, count }))
    .sort((a, b) => b.count - a.count);

  return { activeCount, doneCount, rejectedCount, staleCount, completedLast24h, byStage };
}

// ── Structured case outputs (parity #98) ──
export async function recordCaseOutput(
  workspaceId: string,
  caseId: string,
  input: { stageId?: string | null; key: string; value: unknown },
): Promise<import("@agentcenter/database").PipelineCaseOutput> {
  const c = await prisma.pipelineCase.findFirst({
    where: { id: caseId, pipeline: { workspaceId } },
    select: { id: true },
  });
  if (!c) notFound("Case");
  const key = input.key.trim();
  if (!key) badRequest("output key is required");
  return prisma.pipelineCaseOutput.create({
    data: { caseId, stageId: input.stageId ?? null, key, value: (input.value ?? null) as never },
  });
}

export async function listCaseOutputs(
  workspaceId: string,
  caseId: string,
): Promise<import("@agentcenter/database").PipelineCaseOutput[]> {
  const c = await prisma.pipelineCase.findFirst({
    where: { id: caseId, pipeline: { workspaceId } },
    select: { id: true },
  });
  if (!c) notFound("Case");
  return prisma.pipelineCaseOutput.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } });
}
