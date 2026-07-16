import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  drainPendingDeliveries,
  markDeliveriesAttempted,
  deadLetterExhaustedDeliveries,
  findStalePendingDeliveries,
} from "@agentcenter/database";

// Tier D robustness: attempt-count + dead-letter for un-acked live deliveries. Prevents a delivery
// that never acks from re-draining forever, and gives it a give-up state.
let connId = "";

async function makeConnection(): Promise<string> {
  const conn = await prisma.liveGatewayConnection.create({
    data: {
      machineFingerprint: `fp-${Math.random().toString(36).slice(2, 10)}`,
      machineName: "reap-test",
      connectionStatus: "connected",
      pluginVersion: "0.1.0",
      hostMeta: { hostname: "h", platform: "linux", arch: "x64" },
    },
  });
  return conn.id;
}

async function makeDelivery(taskId: string, over: Record<string, unknown> = {}): Promise<string> {
  const d = await prisma.livePendingDelivery.create({
    data: {
      connectionId: connId,
      agentSlug: "agent-1",
      taskId,
      message: "do work",
      priority: "normal",
      idempotencyKey: `task:${taskId}:agent:agent-1`,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
      ...over,
    },
  });
  return d.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE live_pending_deliveries, live_gateway_connections CASCADE`,
  );
  connId = await makeConnection();
});

describe("live delivery reliability (Tier D)", () => {
  it("drain returns undelivered, non-dead-lettered, unexpired rows oldest-first", async () => {
    await makeDelivery("t1");
    await makeDelivery("t2", { delivered: true, deliveredAt: new Date() });
    await makeDelivery("t3", { deadLetteredAt: new Date() });
    await makeDelivery("t4", { expiresAt: new Date(Date.now() - 1000) });

    const drained = await drainPendingDeliveries(connId);
    expect(drained.map((d) => d.taskId)).toEqual(["t1"]);
  });

  it("markDeliveriesAttempted increments the attempt counter", async () => {
    const id = await makeDelivery("t1");
    await markDeliveriesAttempted([id]);
    await markDeliveriesAttempted([id]);
    const row = await prisma.livePendingDelivery.findUniqueOrThrow({ where: { id } });
    expect(row.attempts).toBe(2);
    expect(row.lastAttemptAt).toBeTruthy();
  });

  it("markDeliveriesAttempted([]) is a no-op", async () => {
    await expect(markDeliveriesAttempted([])).resolves.toBeUndefined();
  });

  it("dead-letters deliveries at/over the attempt cap and excludes them from drain", async () => {
    const exhausted = await makeDelivery("t1", { attempts: 5 });
    const healthy = await makeDelivery("t2", { attempts: 1 });
    const alreadyDelivered = await makeDelivery("t3", { attempts: 9, delivered: true });

    const n = await deadLetterExhaustedDeliveries(5, new Date());
    expect(n).toBe(1); // only the undelivered exhausted one

    expect(
      (await prisma.livePendingDelivery.findUniqueOrThrow({ where: { id: exhausted } }))
        .deadLetteredAt,
    ).toBeTruthy();
    expect(
      (await prisma.livePendingDelivery.findUniqueOrThrow({ where: { id: healthy } }))
        .deadLetteredAt,
    ).toBeNull();
    expect(
      (await prisma.livePendingDelivery.findUniqueOrThrow({ where: { id: alreadyDelivered } }))
        .deadLetteredAt,
    ).toBeNull();

    // The dead-lettered one no longer drains; the healthy one still does.
    const drained = await drainPendingDeliveries(connId);
    expect(drained.map((d) => d.taskId)).toEqual(["t2"]);
  });

  it("findStalePendingDeliveries selects only pushed-but-stale, under-cap, unexpired rows", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 120_000); // 2 min ago
    const fresh = new Date(now.getTime() - 5_000); // 5 s ago
    // stale, eligible
    await makeDelivery("stale", { attempts: 1, lastAttemptAt: old });
    // pushed recently → not stale
    await makeDelivery("recent", { attempts: 1, lastAttemptAt: fresh });
    // never pushed (attempts=0) → skipped (reconnect drain handles it)
    await makeDelivery("never", { attempts: 0, lastAttemptAt: null });
    // at the cap → excluded (dead-letter territory)
    await makeDelivery("exhausted", { attempts: 5, lastAttemptAt: old });
    // already delivered / dead-lettered / expired → excluded
    await makeDelivery("done", { attempts: 1, lastAttemptAt: old, delivered: true });
    await makeDelivery("dl", { attempts: 1, lastAttemptAt: old, deadLetteredAt: now });
    await makeDelivery("expired", {
      attempts: 1,
      lastAttemptAt: old,
      expiresAt: new Date(now.getTime() - 1000),
    });

    const stale = await findStalePendingDeliveries(60_000, 5, now);
    expect(stale.map((d) => d.taskId)).toEqual(["stale"]);
  });
});
