import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  requestAgentWake,
  resolveWakeSuppression,
  resolveSchedulingSuppression,
  claimDueWakeups,
  drainAgentWakeups,
  WAKE_REASON,
} from "../../src/server/services/agent-wakeups";
import { setSystemShutdown } from "../../src/server/system-settings";
import { createTestAgent } from "../helpers";

/**
 * Proactive agent-wake substrate (parity: agentWakeupRequests + heartbeat.wakeup). Service against real
 * Postgres: coalescing, per-agent suppression, and atomic claiming (no double-claim).
 */
async function queuedRows(agentId: string) {
  return prisma.agentWakeup.findMany({
    where: { agentId, status: "queued" },
    select: { id: true, coalescedCount: true, reason: true, notBefore: true },
  });
}

beforeEach(async () => {
  await prisma.agentWakeup.deleteMany({});
});

afterEach(() => {
  // Never leak a suppression flag into another test.
  delete process.env.AGENTCENTER_IN_WORKTREE;
  delete process.env.AGENTCENTER_DATABASE_RESTORE_IN_PROGRESS;
});

describe("requestAgentWake - coalescing", () => {
  it("coalesces two requests for the same agent+reason into ONE row with coalescedCount 2", async () => {
    const { agent } = await createTestAgent({ username: "coalesce-agent" });

    const first = await requestAgentWake(agent.id, WAKE_REASON.STRANDED_WORK);
    expect(first.coalesced).toBe(false);
    expect(first.coalescedCount).toBe(1);

    const second = await requestAgentWake(agent.id, WAKE_REASON.STRANDED_WORK);
    expect(second.coalesced).toBe(true);
    expect(second.id).toBe(first.id); // same row
    expect(second.coalescedCount).toBe(2);

    const rows = await queuedRows(agent.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].coalescedCount).toBe(2);
  });

  it("keeps DISTINCT reasons in distinct rows", async () => {
    const { agent } = await createTestAgent({ username: "distinct-reason-agent" });
    await requestAgentWake(agent.id, WAKE_REASON.STRANDED_WORK);
    await requestAgentWake(agent.id, WAKE_REASON.RUN_RETRY);
    const rows = await queuedRows(agent.id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.reason))).toEqual(
      new Set([WAKE_REASON.STRANDED_WORK, WAKE_REASON.RUN_RETRY]),
    );
  });

  it("pulls the schedule earlier when a coalescing request is more urgent", async () => {
    const { agent } = await createTestAgent({ username: "urgent-agent" });
    const later = new Date(Date.now() + 60_000);
    await requestAgentWake(agent.id, WAKE_REASON.RUN_RETRY, { notBefore: later });
    // An immediate follow-up supersedes the deferred schedule.
    await requestAgentWake(agent.id, WAKE_REASON.RUN_RETRY);
    const rows = await queuedRows(agent.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].notBefore).toBeNull();
  });
});

describe("resolveWakeSuppression", () => {
  it("suppresses a deactivated agent", async () => {
    const { agent } = await createTestAgent({ username: "dead-agent", setupStatus: "deactivated" });
    const verdict = await resolveWakeSuppression(agent.id);
    expect(verdict).toEqual({ suppressed: true, reason: "agent_deactivated" });
  });

  it("suppresses a missing agent (fail-safe)", async () => {
    const verdict = await resolveWakeSuppression("nonexistent-agent-id");
    expect(verdict).toEqual({ suppressed: true, reason: "agent_missing" });
  });

  it("suppresses a worktree instance globally (env)", async () => {
    const { agent } = await createTestAgent({ username: "worktree-agent" });
    process.env.AGENTCENTER_IN_WORKTREE = "1";
    const verdict = await resolveWakeSuppression(agent.id);
    expect(verdict).toEqual({ suppressed: true, reason: "worktree_instance" });
  });

  it("does not suppress a healthy active agent", async () => {
    const { agent } = await createTestAgent({ username: "healthy-agent" });
    const verdict = await resolveWakeSuppression(agent.id);
    expect(verdict).toEqual({ suppressed: false, reason: null });
  });
});

describe("drainAgentWakeups - suppression is respected", () => {
  it("does NOT deliver a suppressed (deactivated) agent's wake; marks it suppressed", async () => {
    const { agent: live } = await createTestAgent({ username: "drain-live" });
    const { agent: dead } = await createTestAgent({
      username: "drain-dead",
      setupStatus: "deactivated",
    });

    await requestAgentWake(live.id, WAKE_REASON.STRANDED_WORK);
    await requestAgentWake(dead.id, WAKE_REASON.STRANDED_WORK);

    const result = await drainAgentWakeups();
    expect(result.delivered).toBe(1);
    expect(result.suppressed).toBe(1);

    const deadRow = await prisma.agentWakeup.findFirstOrThrow({ where: { agentId: dead.id } });
    expect(deadRow.status).toBe("suppressed");
    expect(deadRow.deliveredAt).toBeNull();

    const liveRow = await prisma.agentWakeup.findFirstOrThrow({ where: { agentId: live.id } });
    expect(liveRow.status).toBe("delivered");
    expect(liveRow.deliveredAt).not.toBeNull();
  });

  it("does not deliver a wake whose notBefore is still in the future", async () => {
    const { agent } = await createTestAgent({ username: "future-agent" });
    await requestAgentWake(agent.id, WAKE_REASON.RUN_RETRY, {
      notBefore: new Date(Date.now() + 60_000),
    });
    const result = await drainAgentWakeups();
    expect(result.delivered).toBe(0);
    const rows = await queuedRows(agent.id);
    expect(rows).toHaveLength(1); // still queued
  });
});

describe("§3 #11 (3) — unified pause via resolveSchedulingSuppression", () => {
  it("suppresses when the target project is PAUSED", async () => {
    const project = await prisma.project.create({
      data: { name: "Paused wake proj", shutdownActive: true },
    });
    const verdict = await resolveSchedulingSuppression({ projectId: project.id });
    expect(verdict).toEqual({ suppressed: true, reason: "project_paused" });
  });

  it("suppresses when the target project is ARCHIVED", async () => {
    const project = await prisma.project.create({
      data: { name: "Archived wake proj", status: "archived" },
    });
    const verdict = await resolveSchedulingSuppression({ projectId: project.id });
    expect(verdict).toEqual({ suppressed: true, reason: "project_archived" });
  });

  it("suppresses ALL wakes under a system/workspace pause (shutdown), then clears", async () => {
    const { agent } = await createTestAgent({ username: "shutdown-wake" });
    await setSystemShutdown(true);
    try {
      const verdict = await resolveWakeSuppression(agent.id);
      expect(verdict).toEqual({ suppressed: true, reason: "system_shutdown" });
    } finally {
      await setSystemShutdown(false);
    }
    // Once un-paused the same agent wakes normally again.
    expect(await resolveWakeSuppression(agent.id)).toEqual({ suppressed: false, reason: null });
  });

  it("drainAgentWakeups does NOT deliver a wake for an agent whose current task's project is paused", async () => {
    const project = await prisma.project.create({
      data: { name: "Paused current proj", shutdownActive: true },
    });
    const task = await prisma.task.create({
      data: {
        title: "In paused proj",
        description: "d",
        status: "assigned",
        projectId: project.id,
      },
    });
    const { agent } = await createTestAgent({ username: "paused-proj-agent" });
    await prisma.agent.update({ where: { id: agent.id }, data: { currentTaskId: task.id } });

    await requestAgentWake(agent.id, WAKE_REASON.STRANDED_WORK);
    const result = await drainAgentWakeups();
    expect(result.delivered).toBe(0);
    expect(result.suppressed).toBe(1);
    const row = await prisma.agentWakeup.findFirstOrThrow({ where: { agentId: agent.id } });
    expect(row.status).toBe("suppressed");
    expect(row.deliveredAt).toBeNull();
  });
});

describe("claimDueWakeups - atomic (no double-claim)", () => {
  it("two concurrent claims never return the same row", async () => {
    // Enqueue a batch of due wakes across distinct agents (distinct dedupe keys).
    const agents = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        createTestAgent({ username: `claim-agent-${i}` }).then((r) => r.agent),
      ),
    );
    await Promise.all(agents.map((a) => requestAgentWake(a.id, WAKE_REASON.STRANDED_WORK)));

    // Race two claimers over the same due set.
    const [claimA, claimB] = await Promise.all([claimDueWakeups(), claimDueWakeups()]);

    const idsA = claimA.map((w) => w.id);
    const idsB = claimB.map((w) => w.id);
    const overlap = idsA.filter((id) => idsB.includes(id));
    expect(overlap).toHaveLength(0); // no row claimed by both

    // Every claimed id is unique and every row is now delivered exactly once.
    const allClaimed = [...idsA, ...idsB];
    expect(new Set(allClaimed).size).toBe(allClaimed.length);
    expect(allClaimed.length).toBe(agents.length);

    const delivered = await prisma.agentWakeup.count({ where: { status: "delivered" } });
    expect(delivered).toBe(agents.length);
    const stillQueued = await prisma.agentWakeup.count({ where: { status: "queued" } });
    expect(stillQueued).toBe(0);
  });
});
