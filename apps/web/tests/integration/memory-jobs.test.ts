import { describe, it, expect, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import {
  enqueueMemoryJob,
  claimDueMemoryJobs,
  completeMemoryJob,
  failMemoryJob,
  drainMemoryJobs,
  memoryJobBackoffMs,
} from "../../src/server/services/memory-jobs";

// Async memory-capture job queue (Paperclip memory-jobs port). Asserts the durable state machine via the
// service functions directly: enqueue → atomic lease claim → complete, plus failure → retry-with-backoff
// and exhaustion, plus the MEMORY-flag-gated drain replaying the existing capture path.
const WS = "ws_memjobs";
const AGENT = "agent_memjobs";

async function setFlag(on: boolean) {
  setTestFeature(FLAG_KEYS.MEMORY, on);
  invalidateFlagCache();
}

beforeEach(async () => {
  await prisma.memoryJob.deleteMany({ where: { workspaceId: WS } });
  await prisma.agentMemory.deleteMany({ where: { workspaceId: WS } });
});

function enqueue(summary = "did work") {
  return enqueueMemoryJob({
    workspaceId: WS,
    agentId: AGENT,
    sourceKind: "run",
    sourceRefId: "run-1",
    payload: { agentProvider: "db", taskId: "task-1", runId: "run-1", summary },
  });
}

describe("memory-jobs state machine", () => {
  it("enqueue → claim (atomic lease) → complete", async () => {
    const job = await enqueue();
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);

    const now = new Date();
    const claimed = await claimDueMemoryJobs(now, 10);
    expect(claimed.map((j) => j.id)).toContain(job.id);
    const running = claimed.find((j) => j.id === job.id)!;
    expect(running.status).toBe("running");
    expect(running.attempts).toBe(1);
    expect(running.leaseExpiresAt).not.toBeNull();

    // A second claim before the lease expires must NOT re-grab the same running job.
    const again = await claimDueMemoryJobs(now, 10);
    expect(again.map((j) => j.id)).not.toContain(job.id);

    await completeMemoryJob(job.id);
    const done = await prisma.memoryJob.findUnique({ where: { id: job.id } });
    expect(done?.status).toBe("done");
    expect(done?.leaseExpiresAt).toBeNull();
  });

  it("failure → requeue with backoff, then re-claim only after the backoff passes", async () => {
    const job = await enqueue();
    const now = new Date();
    await claimDueMemoryJobs(now, 10); // attempts → 1
    await failMemoryJob(job.id, "boom", now);

    const requeued = await prisma.memoryJob.findUnique({ where: { id: job.id } });
    expect(requeued?.status).toBe("queued");
    expect(requeued?.lastError).toBe("boom");
    const backoff = memoryJobBackoffMs(1);
    expect(requeued?.leaseExpiresAt?.getTime()).toBe(now.getTime() + backoff);

    // Still within the backoff window → not due.
    const tooSoon = await claimDueMemoryJobs(new Date(now.getTime() + backoff - 1_000), 10);
    expect(tooSoon.map((j) => j.id)).not.toContain(job.id);

    // After the backoff → due again, attempts increments.
    const later = new Date(now.getTime() + backoff + 1_000);
    const reclaimed = await claimDueMemoryJobs(later, 10);
    const j = reclaimed.find((x) => x.id === job.id)!;
    expect(j).toBeTruthy();
    expect(j.attempts).toBe(2);
  });

  it("parks a job as failed once attempts are exhausted", async () => {
    const job = await enqueue();
    await prisma.memoryJob.update({
      where: { id: job.id },
      data: { attempts: 5, status: "running" },
    });
    await failMemoryJob(job.id, "still broken");
    const parked = await prisma.memoryJob.findUnique({ where: { id: job.id } });
    expect(parked?.status).toBe("failed");
    expect(parked?.leaseExpiresAt).toBeNull();
  });

  it("drain is MEMORY-gated and replays the existing capture path", async () => {
    // Flag off → nothing is claimed even with a due job.
    await setFlag(false);
    await enqueue("residue A");
    expect(await drainMemoryJobs()).toMatchObject({ claimed: 0 });

    // Flag on → the job runs through captureRunMemory and persists an AgentMemory entry.
    await setFlag(true);
    const res = await drainMemoryJobs();
    expect(res.completed).toBe(1);
    expect(res.failed).toBe(0);
    const mem = await prisma.agentMemory.findMany({ where: { workspaceId: WS, agentId: AGENT } });
    expect(mem).toHaveLength(1);
    expect(mem[0].content).toContain("residue A");
    // Job is marked done.
    const jobs = await prisma.memoryJob.findMany({ where: { workspaceId: WS } });
    expect(jobs.every((j) => j.status === "done")).toBe(true);
  });
});
