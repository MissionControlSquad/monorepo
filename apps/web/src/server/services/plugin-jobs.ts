import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { PluginJob } from "@agentcenter/database";
import { nextCronTick, isValidCron } from "@agentcenter/utils";

// Plugin job store + scheduler + coordinator (parity #111/#112/#113). Enqueue one-shot or cron-scheduled
// plugin jobs; a worker claims the next due job under a lease (coordinator), runs it, and settles it.
// Failures retry with backoff up to maxAttempts; a cron job re-enqueues its next tick on completion.
// The worker process itself is infra-gated; this is the durable queue it drives. Workspace-scoped.

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Enqueue a job. A `schedule` (cron) makes it recurring; `delayMs`/`runAt` set the first run time. */
export async function enqueuePluginJob(input: {
  workspaceId: string;
  pluginId: string;
  jobKey: string;
  payload?: unknown;
  schedule?: string | null;
  delayMs?: number;
  runAt?: Date;
  maxAttempts?: number;
}): Promise<PluginJob> {
  if (!input.jobKey?.trim()) badRequest("jobKey is required");
  if (input.schedule && !isValidCron(input.schedule))
    badRequest("schedule must be a valid 5-field cron expression");
  const now = Date.now();
  const scheduledFor = input.runAt ?? new Date(now + Math.max(0, input.delayMs ?? 0));
  return prisma.pluginJob.create({
    data: {
      workspaceId: input.workspaceId,
      pluginId: input.pluginId,
      jobKey: input.jobKey.trim(),
      payload: (input.payload ?? undefined) as never,
      schedule: input.schedule ?? null,
      scheduledFor,
      maxAttempts: Math.max(1, input.maxAttempts ?? 3),
    },
  });
}

/**
 * Atomically claim the next due job for a worker (coordinator lease). Returns null when nothing is due.
 * The claim is race-safe: the status flip is guarded by updateMany so two workers can't take the same
 * job.
 */
export async function claimNextPluginJob(
  workspaceId: string,
  workerId: string,
): Promise<PluginJob | null> {
  const now = new Date();
  const candidate = await prisma.pluginJob.findFirst({
    where: { workspaceId, status: "queued", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    select: { id: true },
  });
  if (!candidate) return null;
  const { count } = await prisma.pluginJob.updateMany({
    where: { id: candidate.id, status: "queued" },
    data: { status: "running", lockedAt: now, lockedBy: workerId, attempts: { increment: 1 } },
  });
  if (count === 0) return null; // lost the race to another worker
  return prisma.pluginJob.findUnique({ where: { id: candidate.id } });
}

/** Settle a running job as done. A cron job re-enqueues its next tick; a one-shot terminates. */
export async function completePluginJob(
  workspaceId: string,
  jobId: string,
  result?: unknown,
): Promise<PluginJob> {
  const job = await prisma.pluginJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) badRequest("Job not found");

  if (job.schedule) {
    const next = nextCronTick(job.schedule, new Date());
    if (next) {
      return prisma.pluginJob.update({
        where: { id: jobId },
        data: {
          status: "queued",
          scheduledFor: next,
          lockedAt: null,
          lockedBy: null,
          attempts: 0,
          lastError: null,
          result: (result ?? undefined) as never,
        },
      });
    }
  }
  return prisma.pluginJob.update({
    where: { id: jobId },
    data: {
      status: "done",
      lockedAt: null,
      lockedBy: null,
      result: (result ?? undefined) as never,
    },
  });
}

/**
 * Settle a running job as failed. Retries with exponential backoff (2^attempts minutes) until
 * maxAttempts is exhausted, then parks it in `failed`.
 */
export async function failPluginJob(
  workspaceId: string,
  jobId: string,
  error: string,
): Promise<PluginJob> {
  const job = await prisma.pluginJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) badRequest("Job not found");

  if (job.attempts < job.maxAttempts) {
    const backoffMs = Math.min(2 ** job.attempts, 60) * 60_000; // cap at 60 min
    return prisma.pluginJob.update({
      where: { id: jobId },
      data: {
        status: "queued",
        scheduledFor: new Date(Date.now() + backoffMs),
        lockedAt: null,
        lockedBy: null,
        lastError: error.slice(0, 2000),
      },
    });
  }
  return prisma.pluginJob.update({
    where: { id: jobId },
    data: { status: "failed", lockedAt: null, lockedBy: null, lastError: error.slice(0, 2000) },
  });
}

export function listPluginJobs(
  workspaceId: string,
  opts: { pluginId?: string; status?: string } = {},
): Promise<PluginJob[]> {
  return prisma.pluginJob.findMany({
    where: {
      workspaceId,
      ...(opts.pluginId ? { pluginId: opts.pluginId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  });
}

/**
 * Reclaim jobs whose lease has expired (a worker died mid-run): running jobs locked longer than
 * `staleMs` go back to queued. Returns the count reclaimed. The heartbeat calls this.
 */
export async function reclaimStalePluginJobs(
  workspaceId: string,
  staleMs = 10 * 60_000,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const { count } = await prisma.pluginJob.updateMany({
    where: { workspaceId, status: "running", lockedAt: { lt: cutoff } },
    data: { status: "queued", lockedAt: null, lockedBy: null },
  });
  return count;
}
