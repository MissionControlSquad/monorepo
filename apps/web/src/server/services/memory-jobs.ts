/**
 * Async memory-capture job queue (Paperclip memory-jobs port). Post-run memory capture used to run
 * inline in the run finalizer, so a lost/crashed process dropped the capture. Instead the finalizer now
 * ENQUEUES a durable MemoryJob and the reap cron DRAINS it, so capture is async and survives process
 * loss. The lifecycle is a small state machine — queued → running → done | failed — protected by an
 * atomic lease so overlapping cron ticks never double-run a job, with bounded exponential-backoff retry.
 *
 * leaseExpiresAt carries two meanings: while `running` it is the lease deadline (an expired lease means a
 * dead worker, so the job is reclaimable); while `queued` after a failure it is the not-before instant of
 * the retry backoff (the job is not due until it passes). A queued job with a null lease is due now.
 *
 * The drain re-uses the EXISTING memory-capture path (captureRunMemory) and is MEMORY-flag gated.
 */
import { prisma } from "@/server/prisma";
import type { MemoryJob } from "@agentcenter/database";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { logError } from "@/server/logger";
import { captureRunMemory } from "./agent-memory";

/** How long a claimed job's lease is held before it is considered abandoned + reclaimable. */
const LEASE_MS = 60_000;
/** Max attempts before a job is parked as `failed` for higher-level recovery. */
const MAX_ATTEMPTS = 5;
/** Retry backoff: base * 2^(attempts-1), capped. attempts is already incremented at claim time. */
const RETRY_BASE_MS = 30_000;
const RETRY_CAP_MS = 15 * 60_000;

/** The captured input a run-memory job replays through captureRunMemory. */
export interface MemoryJobPayload {
  agentProvider: string | null;
  taskId?: string | null;
  runId?: string | null;
  summary: string;
}

/**
 * The single run-finalize memory-capture entry point every run path shares (§3 memory). When the MEMORY
 * flag is on, capture is DURABLE + async — enqueue a MemoryJob the reap cron drains, so it survives
 * process loss. With the flag off, fall back to inline capture so nothing regresses. Provenance is
 * always `run`. Best-effort: a capture/enqueue failure must never fail the run, so this never throws.
 *
 * Ported out of the sandbox path so the wakeup/heartbeat-driven (gateway) run path can reuse it verbatim
 * — previously auto-capture lived only in the sandbox branch, leaving wake-driven runs memory-blind.
 */
export async function enqueueOrCaptureRunMemory(input: {
  workspaceId: string;
  agentId: string;
  agentProvider: string | null;
  taskId?: string | null;
  runId?: string | null;
  summary: string;
}): Promise<void> {
  try {
    if (await isFeatureEnabled(FLAG_KEYS.MEMORY)) {
      await enqueueMemoryJob({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        sourceKind: "run",
        sourceRefId: input.runId ?? null,
        payload: {
          agentProvider: input.agentProvider,
          taskId: input.taskId ?? null,
          runId: input.runId ?? null,
          summary: input.summary,
        },
      });
    } else {
      await captureRunMemory({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        agentProvider: input.agentProvider,
        taskId: input.taskId ?? null,
        runId: input.runId ?? null,
        summary: input.summary,
      });
    }
  } catch (err) {
    // Capture is best-effort — never let it fail the run. Log so a systemic drop is visible.
    logError("memory-jobs", "run-finalize memory capture failed", { error: String(err) });
  }
}

/** Backoff delay before the next attempt (attempts = number of attempts already made). */
export function memoryJobBackoffMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_CAP_MS);
}

/**
 * Enqueue a memory-capture job (status `queued`, due immediately). Best-effort at the call site: a
 * failed enqueue must never fail the run, so callers may ignore rejections.
 */
export async function enqueueMemoryJob(input: {
  workspaceId: string;
  agentId: string;
  sourceKind: string;
  sourceRefId?: string | null;
  payload: MemoryJobPayload;
}): Promise<MemoryJob> {
  return prisma.memoryJob.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      sourceKind: input.sourceKind,
      sourceRefId: input.sourceRefId ?? null,
      payload: input.payload as never,
    },
  });
}

/**
 * Atomically claim up to `limit` due jobs. Due = a `queued` job past its (optional) backoff, or a
 * `running` job whose lease expired (dead worker). Each candidate is claimed with a guarded updateMany
 * (status + observed lease) so two overlapping cron ticks can't grab the same row; the winner flips it to
 * `running`, extends the lease, and bumps `attempts`. Returns the freshly-claimed rows.
 */
export async function claimDueMemoryJobs(now: Date = new Date(), limit = 25): Promise<MemoryJob[]> {
  const candidates = await prisma.memoryJob.findMany({
    where: {
      status: { in: ["queued", "running"] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const claimed: MemoryJob[] = [];
  const lease = new Date(now.getTime() + LEASE_MS);
  for (const job of candidates) {
    const claim = await prisma.memoryJob.updateMany({
      where: {
        id: job.id,
        status: job.status,
        leaseExpiresAt: job.leaseExpiresAt, // optimistic guard on the observed lease/backoff value
      },
      data: { status: "running", leaseExpiresAt: lease, attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue; // another tick claimed it first
    const fresh = await prisma.memoryJob.findUnique({ where: { id: job.id } });
    if (fresh) claimed.push(fresh);
  }
  return claimed;
}

/** Mark a claimed job done and release its lease. */
export async function completeMemoryJob(id: string): Promise<void> {
  await prisma.memoryJob.update({
    where: { id },
    data: { status: "done", leaseExpiresAt: null, lastError: null },
  });
}

/**
 * Fail a claimed job. Under the attempt cap it goes back to `queued` with a backoff (leaseExpiresAt = the
 * not-before instant), so the drain re-picks it later; at the cap it is parked as `failed`. Records the
 * error either way. `attempts` was already incremented at claim time.
 */
export async function failMemoryJob(
  id: string,
  error: string,
  now: Date = new Date(),
): Promise<void> {
  const job = await prisma.memoryJob.findUnique({ where: { id } });
  if (!job) return;
  const exhausted = job.attempts >= MAX_ATTEMPTS;
  await prisma.memoryJob.update({
    where: { id },
    data: {
      status: exhausted ? "failed" : "queued",
      leaseExpiresAt: exhausted ? null : new Date(now.getTime() + memoryJobBackoffMs(job.attempts)),
      lastError: error.slice(0, 2_000),
    },
  });
}

/** Replay one claimed job through the existing memory-capture path. */
async function runMemoryJob(job: MemoryJob): Promise<void> {
  const payload = job.payload as unknown as MemoryJobPayload;
  await captureRunMemory({
    workspaceId: job.workspaceId,
    agentId: job.agentId,
    agentProvider: payload.agentProvider,
    taskId: payload.taskId ?? null,
    runId: payload.runId ?? null,
    summary: payload.summary,
  });
}

/**
 * Drain due memory-capture jobs (called from the reap cron). MEMORY-flag gated: when the feature is off
 * nothing is claimed. Each claimed job is run through the existing capture path; success completes it,
 * a throw fails it (retry-with-backoff or park). Returns the counts. Best-effort — never throws.
 */
export async function drainMemoryJobs(
  now: Date = new Date(),
  limit = 25,
): Promise<{ claimed: number; completed: number; failed: number }> {
  if (!(await isFeatureEnabled(FLAG_KEYS.MEMORY))) {
    return { claimed: 0, completed: 0, failed: 0 };
  }
  const jobs = await claimDueMemoryJobs(now, limit);
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await runMemoryJob(job);
      await completeMemoryJob(job.id);
      completed++;
    } catch (err) {
      failed++;
      await failMemoryJob(job.id, String(err), now).catch((e) =>
        logError("memory-jobs", `failed to record failure for job ${job.id}`, { error: String(e) }),
      );
    }
  }
  return { claimed: jobs.length, completed, failed };
}
