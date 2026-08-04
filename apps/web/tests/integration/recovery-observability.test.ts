import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { getRecoveryStats } from "../../src/server/services/recovery-observability";
import { createTestAgent, createTestTask } from "../helpers";

// Parity #137 — recovery observability summary over TaskRecoveryAction rows.
let taskId: string;

beforeEach(async () => {
  await prisma.taskRecoveryAction.deleteMany({});
  const { agent } = await createTestAgent(); // auto-generated unique username
  const task = await createTestTask(agent.id, { status: "in_progress" });
  taskId = task.id;
});

async function action(status: string, detectedBy: string, ageMs = 0) {
  await prisma.taskRecoveryAction.create({
    data: {
      taskId,
      detectedBy,
      reason: "stalled",
      status: status as never,
      createdAt: new Date(Date.now() - ageMs),
    },
  });
}

describe("getRecoveryStats (#137)", () => {
  it("returns zeroed stats when there are no recovery actions", async () => {
    const s = await getRecoveryStats();
    expect(s).toMatchObject({ total: 0, resolved: 0, failed: 0, resolvedRate: 0, last24h: 0 });
    expect(s.byDetectedBy).toEqual([]);
  });

  it("aggregates status counts, resolved-rate, recency, and detection sources", async () => {
    await action("resolved", "cron");
    await action("resolved", "cron");
    await action("failed", "watchdog-1");
    await action("attempting", "cron");
    await action("detected", "watchdog-1", 48 * 60 * 60 * 1000); // 2 days old → not in last24h

    const s = await getRecoveryStats();
    expect(s).toMatchObject({
      total: 5,
      detected: 1,
      attempting: 1,
      resolved: 2,
      failed: 1,
      last24h: 4, // the 2-day-old one is excluded
    });
    // resolved / (resolved + failed) = 2 / 3
    expect(s.resolvedRate).toBeCloseTo(2 / 3, 5);
    // busiest detector first: cron (3) then watchdog-1 (2)
    expect(s.byDetectedBy).toEqual([
      { detectedBy: "cron", count: 3 },
      { detectedBy: "watchdog-1", count: 2 },
    ]);
  });
});
