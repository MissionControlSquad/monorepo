import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { wakeDependentsOf } from "../../src/server/services/dependency-wakeups";
import { createTestAgent, createTestTask } from "../helpers";

/**
 * Parity #1 — dependency wakeups. Service against real Postgres: a blocked task moves to `inbox`
 * only once every one of its blockers (blockedByTaskId + `blocks` relations) is terminal.
 */
async function reload(id: string) {
  return prisma.task.findUniqueOrThrow({
    where: { id },
    select: { status: true, blockedByTaskId: true },
  });
}

let agentId: string;

beforeAll(async () => {
  const { agent } = await createTestAgent({ username: "wake-agent" });
  agentId = agent.id;
});

beforeEach(async () => {
  invalidateFlagCache();
  // TASK_AUTONOMY defaults on (no flag row + no license). Ensure any prior test's disable is cleared.
  await prisma.featureFlag.deleteMany({ where: { key: "task_autonomy" } });
});

describe("wakeDependentsOf (blockedByTaskId edge)", () => {
  it("wakes a blocked task when its single blocker becomes done", async () => {
    const blocker = await createTestTask(agentId, { status: "in_progress" });
    const blocked = await createTestTask(agentId, { status: "blocked" });
    await prisma.task.update({
      where: { id: blocked.id },
      data: { blockedByTaskId: blocker.id },
    });

    // Blocker not terminal yet → no wake.
    expect(await wakeDependentsOf(blocker.id)).toEqual([]);
    expect((await reload(blocked.id)).status).toBe("blocked");

    // Blocker done → wake.
    await prisma.task.update({ where: { id: blocker.id }, data: { status: "done" } });
    const woken = await wakeDependentsOf(blocker.id);
    expect(woken).toEqual([blocked.id]);

    const after = await reload(blocked.id);
    expect(after.status).toBe("inbox");
    expect(after.blockedByTaskId).toBeNull();
  });

  it("wakes on a cancelled (terminal) blocker too", async () => {
    const blocker = await createTestTask(agentId, { status: "cancelled" });
    const blocked = await createTestTask(agentId, { status: "blocked" });
    await prisma.task.update({
      where: { id: blocked.id },
      data: { blockedByTaskId: blocker.id },
    });
    expect(await wakeDependentsOf(blocker.id)).toEqual([blocked.id]);
    expect((await reload(blocked.id)).status).toBe("inbox");
  });

  it("does not touch a non-blocked task pointing at the blocker", async () => {
    const blocker = await createTestTask(agentId, { status: "done" });
    // in_progress (not `blocked`) — an agent already working; must not be reset.
    const other = await createTestTask(agentId, { status: "in_progress" });
    await prisma.task.update({ where: { id: other.id }, data: { blockedByTaskId: blocker.id } });
    expect(await wakeDependentsOf(blocker.id)).toEqual([]);
    expect((await reload(other.id)).status).toBe("in_progress");
  });
});

describe("wakeDependentsOf (multiple blockers via `blocks` relations)", () => {
  it("only wakes once EVERY blocker is terminal", async () => {
    const b1 = await createTestTask(agentId, { status: "in_progress" });
    const b2 = await createTestTask(agentId, { status: "in_progress" });
    const blocked = await createTestTask(agentId, { status: "blocked" });
    // b1 and b2 each block `blocked` via a typed relation.
    await prisma.taskRelation.createMany({
      data: [
        { sourceTaskId: b1.id, targetTaskId: blocked.id, type: "blocks" },
        { sourceTaskId: b2.id, targetTaskId: blocked.id, type: "blocks" },
      ],
    });

    // b1 done, b2 still running → not woken.
    await prisma.task.update({ where: { id: b1.id }, data: { status: "done" } });
    expect(await wakeDependentsOf(b1.id)).toEqual([]);
    expect((await reload(blocked.id)).status).toBe("blocked");

    // b2 done → all blockers terminal → woken.
    await prisma.task.update({ where: { id: b2.id }, data: { status: "done" } });
    expect(await wakeDependentsOf(b2.id)).toEqual([blocked.id]);
    expect((await reload(blocked.id)).status).toBe("inbox");
  });
});

describe("gating", () => {
  it("is a no-op when TASK_AUTONOMY is disabled", async () => {
    await prisma.featureFlag.upsert({
      where: { key: "task_autonomy" },
      create: { key: "task_autonomy", enabled: false, managedBy: "system" },
      update: { enabled: false },
    });
    invalidateFlagCache();

    const blocker = await createTestTask(agentId, { status: "done" });
    const blocked = await createTestTask(agentId, { status: "blocked" });
    await prisma.task.update({
      where: { id: blocked.id },
      data: { blockedByTaskId: blocker.id },
    });
    expect(await wakeDependentsOf(blocker.id)).toEqual([]);
    expect((await reload(blocked.id)).status).toBe("blocked");
  });
});
