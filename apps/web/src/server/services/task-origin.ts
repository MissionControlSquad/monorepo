import { createHash } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { Prisma, Task } from "@agentcenter/database";

// Task origin/provenance + per-origin idempotency (parity Domain-8 §2.1 / G6.4). Autonomy creators
// (routine / watchdog / plan-decomposition / recovery) stamp WHERE a task came from and an idempotency
// fingerprint so a repeated cycle doesn't spawn duplicate tasks. requestDepth bounds recursive autonomy.

const MAX_REQUEST_DEPTH = 8;

export interface TaskOrigin {
  originKind: string; // routine | watchdog | decomposition | recovery | manual | ...
  originRunId?: string | null;
  /** The distinguishing parts of the origin identity (order-independent) — hashed into the fingerprint. */
  keyParts: (string | number)[];
  requestDepth?: number;
}

/** Pure-ish (crypto): a stable idempotency fingerprint from the origin kind + key parts. */
export function computeTaskOriginFingerprint(origin: {
  originKind: string;
  keyParts: (string | number)[];
}): string {
  const canonical = [origin.originKind, ...origin.keyParts.map((p) => String(p))].join("");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Create a task idempotently under an origin. If a task with the same fingerprint already exists, it is
 * returned unchanged (no duplicate). Enforces the recursion-depth bound. The DB partial-unique index is
 * the race backstop: a concurrent duplicate insert (P2002) resolves to the existing row.
 */
export async function createTaskWithOrigin(
  data: Prisma.TaskCreateInput,
  origin: TaskOrigin,
): Promise<{ task: Task; deduped: boolean }> {
  const depth = origin.requestDepth ?? 0;
  if (depth > MAX_REQUEST_DEPTH)
    throw new GraphQLError(`autonomy request depth ${depth} exceeds ${MAX_REQUEST_DEPTH}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });

  const originFingerprint = computeTaskOriginFingerprint(origin);

  const existing = await prisma.task.findFirst({ where: { originFingerprint } });
  if (existing) return { task: existing, deduped: true };

  try {
    const task = await prisma.task.create({
      data: {
        ...data,
        originKind: origin.originKind,
        originRunId: origin.originRunId ?? null,
        originFingerprint,
        requestDepth: depth,
      },
    });
    return { task, deduped: false };
  } catch (err) {
    // Lost the race to a concurrent create with the same fingerprint → return the winner.
    if ((err as { code?: string }).code === "P2002") {
      const winner = await prisma.task.findFirst({ where: { originFingerprint } });
      if (winner) return { task: winner, deduped: true };
    }
    throw err;
  }
}
