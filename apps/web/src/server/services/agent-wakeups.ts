/**
 * Proactive agent-wake substrate (parity: agentWakeupRequests + heartbeat.wakeup). A DB-backed,
 * COALESCING per-agent wake queue that lets the recovery paths proactively wake an agent instead of
 * relying on it to self-poll. The model:
 *
 *  - requestAgentWake(agentId, reason) - enqueue a wake, COALESCING onto an existing `queued` row for
 *    the same agent + reason (dedupeKey). Two requests inside the same queued window fold onto one row
 *    (coalescedCount++), so a burst of triggers wakes the agent once. Coalescing is made atomic by a
 *    partial UNIQUE index (dedupeKey WHERE status = 'queued', in the migration): the create path races
 *    on it and, on a unique violation, falls back to the coalesce path.
 *  - resolveWakeSuppression(agentId) - the guard ported from Paperclip's scheduling-suppression: a
 *    worktree / db-restore INSTANCE is globally suppressed; a deactivated or missing AGENT is
 *    per-agent suppressed. A suppressed wake is never delivered.
 *  - claimDueWakeups(now) - atomically claim due `queued` rows → `delivered` via
 *    `UPDATE ... FOR UPDATE SKIP LOCKED RETURNING`, so overlapping cron ticks can't double-claim.
 *  - drainAgentWakeups(now) - the reap-cron entry point: mark suppressed agents' due wakes `suppressed`
 *    (not delivered), then claim + deliver the rest (emit AGENT_WAKE_DELIVERED). Delivery here is the
 *    event emit (a live-gateway push is a future seam); marking `delivered` closes the loop.
 */
import { prisma } from "@/server/prisma";
import { Prisma, getProjectStatus } from "@agentcenter/database";
import { emit } from "@/server/events/bus";
import { EventTypes } from "@/server/constants";
import { logError } from "@/server/logger";
import { isSystemShutdown } from "@/server/system-settings";
import { ProjectStatus } from "@/server/constants";

/** Well-known wake reasons. Combined with agentId to form the coalescing dedupeKey. */
export const WAKE_REASON = {
  STRANDED_WORK: "stranded_work",
  DEPENDENCY_READY: "dependency_ready",
  RUN_RETRY: "run_retry",
} as const;

export type WakeReason = (typeof WAKE_REASON)[keyof typeof WAKE_REASON] | (string & {});

/**
 * Every reason a scheduling path may be suppressed. Superset of the original wake-only reasons: the
 * §3 #11 (3) unification folds project-pause + system-pause (shutdown) + instance-suppression into ONE
 * guard so recurring tasks, routine triggers, and agent wakes all honor pause identically.
 */
export type SchedulingSuppressionReason =
  | "worktree_instance"
  | "database_restore_in_progress"
  | "system_shutdown"
  | "workspace_paused"
  | "project_archived"
  | "project_paused"
  | "agent_deactivated"
  | "agent_missing";

export type WakeSuppressionReason = SchedulingSuppressionReason;

/**
 * §3 #11 (3) — the SINGLE scheduling-suppression guard. Any path that is about to create scheduled work
 * (generate a recurring task, fire a routine, deliver an agent wake, drain a queued run) calls this so a
 * pause is honored consistently instead of being re-checked ad hoc. Precedence, fail-safe:
 *   1. INSTANCE-global (env): a preview worktree / db-restore instance suppresses everything.
 *   2. SYSTEM pause: the global shutdown switch (SystemSettings.shutdownActive) — the "workspace pause".
 *   3. AGENT (when agentId given): a deactivated or missing agent is per-agent suppressed (unknown ⇒
 *      suppressed, never woken). We also read the agent's current task to derive its project.
 *   4. PROJECT (explicit projectId, else the agent's current-task project): archived or paused ⇒ suppress.
 * Returns { suppressed:false, reason:null } when nothing pauses the work.
 */
export async function resolveSchedulingSuppression(opts: {
  agentId?: string | null;
  projectId?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<{ suppressed: boolean; reason: SchedulingSuppressionReason | null }> {
  const env = opts.env ?? process.env;
  // 1. INSTANCE-global suppression (worktree preview / database restore) — never schedule here.
  if (isTruthyEnv(env.AGENTCENTER_IN_WORKTREE)) {
    return { suppressed: true, reason: "worktree_instance" };
  }
  if (
    isTruthyEnv(env.AGENTCENTER_DATABASE_RESTORE_IN_PROGRESS) ||
    isTruthyEnv(env.AGENTCENTER_RESTORE_IN_PROGRESS)
  ) {
    return { suppressed: true, reason: "database_restore_in_progress" };
  }
  // 2. SYSTEM (global "workspace") pause — the operator-flipped shutdown switch.
  if (await isSystemShutdown()) {
    return { suppressed: true, reason: "system_shutdown" };
  }
  // 3. AGENT suppression (+ derive the agent's current project for the project check below).
  let projectId = opts.projectId ?? null;
  if (opts.agentId) {
    const agent = await prisma.agent.findUnique({
      where: { id: opts.agentId },
      select: { setupStatus: true, currentTaskId: true },
    });
    if (!agent) return { suppressed: true, reason: "agent_missing" };
    if (agent.setupStatus === "deactivated") {
      return { suppressed: true, reason: "agent_deactivated" };
    }
    if (!projectId && agent.currentTaskId) {
      const task = await prisma.task.findUnique({
        where: { id: agent.currentTaskId },
        select: { projectId: true },
      });
      projectId = task?.projectId ?? null;
    }
  }
  // 4. PROJECT pause / archive.
  if (projectId) {
    const project = await getProjectStatus(projectId);
    if (project?.status === ProjectStatus.ARCHIVED) {
      return { suppressed: true, reason: "project_archived" };
    }
    if (project?.shutdownActive) {
      return { suppressed: true, reason: "project_paused" };
    }
  }
  return { suppressed: false, reason: null };
}

interface RequestAgentWakeResult {
  id: string;
  /** True when this request folded onto an existing queued row instead of inserting a new one. */
  coalesced: boolean;
  coalescedCount: number;
}

interface RequestAgentWakeOptions {
  /** Earliest delivery instant; omit/null = due immediately. */
  notBefore?: Date | null;
  /** buildbase workspace id to stamp on a new row (D5). Ignored when coalescing onto an existing row. */
  workspaceId?: string | null;
}

/** Coalescing key: at most one queued wake per agent + reason (enforced by a partial unique index). */
function dedupeKeyFor(agentId: string, reason: string): string {
  return `${agentId}:${reason}`;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/**
 * Enqueue a proactive wake for `agentId`, coalescing onto a still-`queued` wake for the same reason.
 * Never throws for the caller's sake beyond genuine DB failures - the recovery paths call this
 * best-effort. Returns the (new or reused) row id, whether it coalesced, and the resulting count.
 */
export async function requestAgentWake(
  agentId: string,
  reason: WakeReason,
  opts: RequestAgentWakeOptions = {},
): Promise<RequestAgentWakeResult> {
  const dedupeKey = dedupeKeyFor(agentId, reason);
  const notBefore = opts.notBefore ?? null;

  // 1. Coalesce: fold onto the existing queued row for this key, if any (atomic increment).
  const coalesced = await coalesceOnto(dedupeKey, notBefore);
  if (coalesced)
    return { id: coalesced.id, coalesced: true, coalescedCount: coalesced.coalescedCount };

  // 2. No queued row → insert. The partial unique index (dedupeKey WHERE status='queued') makes this
  //    race-safe: a concurrent insert that beat us raises P2002, and we coalesce onto the winner.
  try {
    const created = await prisma.agentWakeup.create({
      data: {
        agentId,
        reason,
        dedupeKey,
        status: "queued",
        coalescedCount: 1,
        notBefore,
        workspaceId: opts.workspaceId ?? null,
      },
      select: { id: true, coalescedCount: true },
    });
    return { id: created.id, coalesced: false, coalescedCount: created.coalescedCount };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const retry = await coalesceOnto(dedupeKey, notBefore);
      if (retry) return { id: retry.id, coalesced: true, coalescedCount: retry.coalescedCount };
    }
    throw err;
  }
}

/**
 * Increment the coalescedCount of the existing queued row for `dedupeKey` and pull its notBefore
 * earlier if this request is more urgent. Returns the reused row, or null when there is no queued row.
 */
async function coalesceOnto(
  dedupeKey: string,
  notBefore: Date | null,
): Promise<{ id: string; coalescedCount: number } | null> {
  const now = new Date();
  const bumped = await prisma.agentWakeup.updateMany({
    where: { dedupeKey, status: "queued" },
    data: { coalescedCount: { increment: 1 }, updatedAt: now },
  });
  if (bumped.count === 0) return null;

  // Keep the SOONEST requested delivery: an immediate (null) request supersedes a deferred schedule,
  // and an earlier notBefore pulls a later one forward.
  if (notBefore === null) {
    await prisma.agentWakeup.updateMany({
      where: { dedupeKey, status: "queued", notBefore: { not: null } },
      data: { notBefore: null },
    });
  } else {
    await prisma.agentWakeup.updateMany({
      where: { dedupeKey, status: "queued", notBefore: { gt: notBefore } },
      data: { notBefore },
    });
  }

  const row = await prisma.agentWakeup.findFirst({
    where: { dedupeKey, status: "queued" },
    select: { id: true, coalescedCount: true },
  });
  return row;
}

/**
 * Wake-suppression guard (parity port). Now a THIN delegate over the unified
 * {@link resolveSchedulingSuppression} (§3 #11.3) so a wake honors the exact same pause set as every
 * other scheduling path: instance suppression (worktree / db-restore), the system/workspace pause, the
 * target agent's deactivation, and — derived from the agent's current task — a paused/archived project.
 * Fail-safe: an unknown agent is treated as suppressed rather than woken.
 */
export async function resolveWakeSuppression(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ suppressed: boolean; reason: WakeSuppressionReason | null }> {
  return resolveSchedulingSuppression({ agentId, env });
}

export interface ClaimedWake {
  id: string;
  workspaceId: string | null;
  agentId: string;
  reason: string;
  coalescedCount: number;
}

/**
 * Atomically claim up to `limit` due `queued` wakes, transitioning them to `delivered` and returning
 * the claimed rows. `FOR UPDATE SKIP LOCKED` guarantees that two overlapping drains never claim the
 * same row (no double-claim / no double-wake). Ordered oldest-first for fairness.
 */
export async function claimDueWakeups(now: Date = new Date(), limit = 200): Promise<ClaimedWake[]> {
  // The timestamp columns are `timestamp` WITHOUT time zone, and Prisma stores/reads them as naive-UTC.
  // Binding a JS Date into raw SQL would let Postgres reinterpret the naive column in the session time
  // zone (a silent skew under a non-UTC session). Bind naive-UTC ISO strings cast to `timestamp` so the
  // comparison and the writes stay consistent with Prisma's own convention.
  const nowTs = now.toISOString();
  const rows = await prisma.$queryRaw<
    {
      id: string;
      workspaceId: string | null;
      agentId: string;
      reason: string;
      coalescedCount: number;
    }[]
  >`
    UPDATE "agent_wakeups"
       SET "status" = 'delivered', "deliveredAt" = ${nowTs}::timestamp, "updatedAt" = ${nowTs}::timestamp
     WHERE "id" IN (
       SELECT "id" FROM "agent_wakeups"
        WHERE "status" = 'queued'
          AND ("notBefore" IS NULL OR "notBefore" <= ${nowTs}::timestamp)
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING "id", "workspaceId", "agentId", "reason", "coalescedCount"`;
  return rows;
}

export interface DrainResult {
  delivered: number;
  suppressed: number;
}

/**
 * Drain due wakes (called from the reap cron). First, for every agent with a due wake, evaluate
 * suppression and mark that agent's due wakes `suppressed` (dropped, not delivered) - so a deactivated
 * agent or a suppressed instance is never woken. Then atomically claim + deliver the remainder,
 * emitting AGENT_WAKE_DELIVERED per wake. Best-effort and idempotent across ticks.
 */
export async function drainAgentWakeups(now: Date = new Date(), limit = 200): Promise<DrainResult> {
  // Distinct agents that currently have a due queued wake.
  const dueAgents = await prisma.agentWakeup.findMany({
    where: { status: "queued", OR: [{ notBefore: null }, { notBefore: { lte: now } }] },
    distinct: ["agentId"],
    select: { agentId: true },
    take: limit,
  });

  let suppressed = 0;
  for (const { agentId } of dueAgents) {
    const verdict = await resolveWakeSuppression(agentId);
    if (!verdict.suppressed) continue;
    const dropped = await prisma.agentWakeup.updateMany({
      where: {
        agentId,
        status: "queued",
        OR: [{ notBefore: null }, { notBefore: { lte: now } }],
      },
      data: { status: "suppressed", updatedAt: now },
    });
    suppressed += dropped.count;
  }

  // Atomically claim + deliver the wakes that survived suppression.
  const claimed = await claimDueWakeups(now, limit);
  for (const wake of claimed) {
    try {
      await emit({
        type: EventTypes.AGENT_WAKE_DELIVERED,
        wakeupId: wake.id,
        agentId: wake.agentId,
        reason: wake.reason,
        coalescedCount: wake.coalescedCount,
        workspaceId: wake.workspaceId,
      });
    } catch (err) {
      logError("agent-wakeups", `failed to emit wake delivery for ${wake.id}`, {
        error: String(err),
      });
    }
  }

  return { delivered: claimed.length, suppressed };
}

/**
 * Fire-and-forget helper for the recovery paths: enqueue a coalesced wake without letting a queue
 * failure break the primary recovery action. Logs and swallows any error.
 */
export async function tryRequestAgentWake(
  agentId: string,
  reason: WakeReason,
  opts: RequestAgentWakeOptions = {},
): Promise<void> {
  try {
    await requestAgentWake(agentId, reason, opts);
  } catch (err) {
    logError("agent-wakeups", `failed to enqueue wake for agent ${agentId} (${reason})`, {
      error: String(err),
    });
  }
}
