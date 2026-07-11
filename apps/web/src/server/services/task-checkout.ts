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
