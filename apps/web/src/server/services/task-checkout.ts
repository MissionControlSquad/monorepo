/**
 * Task lease checkout (Epic #8). Race-free claim of a task by a single conditional UPDATE
 * (no interactive transaction / row lock held across a round-trip). A checkout returns an opaque
 * fencing token; renew/release require the matching token so a stale owner can't clobber a
 * reclaimed task. An expired lease is reclaimable by anyone.
 */
import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { isUnderHold } from "./task-tree-hold";

/** A blocker is "resolved" once it reaches a terminal status; only then can the blocked task proceed. */
const TERMINAL_BLOCKER_STATUSES = new Set(["done", "cancelled"]);

/**
 * Parity §3.12 — refuse checkout while a task still has an UNRESOLVED blocking dependency. A task is
 * blocked by its `blockedByTaskId` edge and by every `TaskRelation` of type `blocks` targeting it; a
 * blocker is resolved only once it is `done`/`cancelled`. Previously this was only noticed later in
 * stranded-work; catching it at claim time gives the claimer an actionable, readable error. Returns
 * the list of open blockers (empty when clear) so callers can surface which tasks to finish first.
 */
export async function findUnresolvedBlockers(
  taskId: string,
): Promise<{ id: string; taskNumber: number; title: string; status: string }[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { blockedByTaskId: true },
  });
  if (!task) return [];

  const blockerIds = new Set<string>();
  if (task.blockedByTaskId) blockerIds.add(task.blockedByTaskId);
  const relations = await prisma.taskRelation.findMany({
    where: { targetTaskId: taskId, type: "blocks" },
    select: { sourceTaskId: true },
  });
  for (const r of relations) blockerIds.add(r.sourceTaskId);
  if (blockerIds.size === 0) return [];

  const blockers = await prisma.task.findMany({
    where: { id: { in: [...blockerIds] } },
    select: { id: true, taskNumber: true, title: true, status: true },
  });
  return blockers.filter((b) => !TERMINAL_BLOCKER_STATUSES.has(b.status));
}

/** Throw a readable, actionable error if the task has any unresolved blocker. No-op when clear. */
export async function assertNoUnresolvedBlockers(taskId: string): Promise<void> {
  const open = await findUnresolvedBlockers(taskId);
  if (open.length === 0) return;
  const list = open.map((b) => `#${b.taskNumber} "${b.title}" (${b.status})`).join(", ");
  throw new GraphQLError(
    `Task is blocked by unresolved work: ${list}. Finish (mark done or cancel) ${
      open.length === 1 ? "that task" : "those tasks"
    } before checking this one out.`,
    { extensions: { code: "TASK_BLOCKED", blockers: open.map((b) => b.id) } },
  );
}

/** Pure: a lease is expired when its expiry is in the past. Unit-testable. */
export function isLeaseExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt != null && expiresAt.getTime() < now.getTime();
}

/** Pure: a task is actively checked out when it has an owner and a still-live lease. */
export function isCheckedOut(
  task: { checkedOutByProfileId: string | null; checkoutLeaseExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return task.checkedOutByProfileId != null && !isLeaseExpired(task.checkoutLeaseExpiresAt, now);
}

export interface CheckoutResult {
  taskId: string;
  token: string;
  leaseExpiresAt: Date;
}

/**
 * Atomically claim a task. Succeeds only when the task is free (no owner) or its lease has expired.
 * Refused if any ancestor holds the subtree.
 */
export async function checkoutTask(
  taskId: string,
  profileId: string,
  leaseSeconds: number,
): Promise<CheckoutResult> {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0)
    throw new GraphQLError("leaseSeconds must be a positive integer", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  if (await isUnderHold(taskId))
    throw new GraphQLError("Task is under a subtree hold", { extensions: { code: "CONFLICT" } });
  // Parity §3.12 — a task with unresolved blockers can't be claimed (fail early with a clear error).
  await assertNoUnresolvedBlockers(taskId);

  const token = randomUUID();
  const rows = await prisma.$queryRaw<{ id: string; token: string; expires: Date }[]>`
    UPDATE "tasks"
       SET "checkedOutByProfileId" = ${profileId},
           "checkedOutAt" = now(),
           "checkoutLeaseExpiresAt" = now() + make_interval(secs => ${leaseSeconds}),
           "checkoutToken" = ${token}
     WHERE "id" = ${taskId}
       AND ("checkedOutByProfileId" IS NULL OR "checkoutLeaseExpiresAt" < now())
     RETURNING "id", "checkoutToken" AS token, "checkoutLeaseExpiresAt" AS expires`;
  if (rows.length === 0)
    throw new GraphQLError("Task is already checked out", { extensions: { code: "CONFLICT" } });
  return { taskId: rows[0].id, token: rows[0].token, leaseExpiresAt: rows[0].expires };
}

/** Extend a live checkout's lease. Requires the matching fencing token (rejects a reclaimed task). */
export async function renewCheckout(
  taskId: string,
  token: string,
  leaseSeconds: number,
): Promise<Date> {
  const rows = await prisma.$queryRaw<{ expires: Date }[]>`
    UPDATE "tasks"
       SET "checkoutLeaseExpiresAt" = now() + make_interval(secs => ${leaseSeconds})
     WHERE "id" = ${taskId} AND "checkoutToken" = ${token}
     RETURNING "checkoutLeaseExpiresAt" AS expires`;
  if (rows.length === 0)
    throw new GraphQLError("Invalid or superseded checkout token", {
      extensions: { code: "CONFLICT" },
    });
  return rows[0].expires;
}

/** Release a checkout. Requires the matching fencing token. Returns false if the token no longer owns it. */
export async function releaseCheckout(taskId: string, token: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "tasks"
       SET "checkedOutByProfileId" = NULL, "checkedOutAt" = NULL,
           "checkoutLeaseExpiresAt" = NULL, "checkoutToken" = NULL
     WHERE "id" = ${taskId} AND "checkoutToken" = ${token}
     RETURNING "id"`;
  return rows.length > 0;
}

/**
 * Proactively release every checkout whose lease has expired (self-healing sweep, run from the
 * reap-stale-work cron). Without this, an expired lease is only cleared lazily when someone else
 * tries to check the task out — so a task abandoned by a dead worker can look "checked out"
 * indefinitely. A still-live worker whose lease was swept simply fails its next token-gated renew
 * (correct fencing). Returns the number released.
 */
export async function sweepExpiredCheckouts(now: Date = new Date()): Promise<number> {
  const res = await prisma.task.updateMany({
    where: { checkedOutByProfileId: { not: null }, checkoutLeaseExpiresAt: { lt: now } },
    data: {
      checkedOutByProfileId: null,
      checkedOutAt: null,
      checkoutLeaseExpiresAt: null,
      checkoutToken: null,
    },
  });
  return res.count;
}

/** Force-clear a checkout (recovery path — no token, used by watchdog/cron). */
export async function forceReleaseCheckout(taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      checkedOutByProfileId: null,
      checkedOutAt: null,
      checkoutLeaseExpiresAt: null,
      checkoutToken: null,
    },
  });
}
