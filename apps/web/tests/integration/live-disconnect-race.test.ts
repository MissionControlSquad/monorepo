import { describe, it, expect, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import {
  tryDeliverTaskToLiveAgents,
  redeliverStalePending,
} from "../../src/server/services/live-task-delivery";

// Tier D robustness (disconnect race): a task assigned while a known machine is briefly disconnected
// must still be enqueued against its (stable) connection so it drains on reconnect — not lost to the
// live path. This holds because we no longer clear agent routes on disconnect; the invariant is that
// tryDeliverTaskToLiveAgents enqueues for a disconnected-but-routed connection.
const WS = "ws_race";

async function enableLiveGateway() {
  setTestFeature(FLAG_KEYS.LIVE_GATEWAY, true);
  invalidateFlagCache();
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE live_pending_deliveries, live_agent_routes, live_gateway_connections, tasks, agents CASCADE`,
  );
  resetTestFeature(FLAG_KEYS.LIVE_GATEWAY);
  invalidateFlagCache();
  await enableLiveGateway();
});

describe("live-gateway disconnect race (Tier D)", () => {
  it("enqueues a task for an agent whose connection is disconnected (routes persist)", async () => {
    const agent = await prisma.agent.create({
      data: {
        name: "HB",
        username: "hb-agent",
        role: "worker",
        workspaceId: WS,
        setupStatus: "active",
      },
    });
    const task = await prisma.task.create({
      data: { title: "Do it", description: "desc", status: "assigned" },
    });
    const conn = await prisma.liveGatewayConnection.create({
      data: {
        machineFingerprint: "fp-race",
        machineName: "m",
        connectionStatus: "disconnected", // the brief window after a drop, before reconnect
        pluginVersion: "0.1.0",
        hostMeta: { hostname: "h", platform: "linux", arch: "x64" },
        agentRoutes: { create: [{ agentSlug: "hb-agent" }] },
      },
    });

    await tryDeliverTaskToLiveAgents([agent.id], {
      taskId: task.id,
      taskTitle: "Do it",
      priority: "normal",
    });

    const deliveries = await prisma.livePendingDelivery.findMany({ where: { taskId: task.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].connectionId).toBe(conn.id);
    expect(deliveries[0].agentSlug).toBe("hb-agent");
    // Not yet delivered (no live socket) — it will drain on reconnect.
    expect(deliveries[0].delivered).toBe(false);
  });

  it("enqueues nothing when the agent has no connection at all (heartbeat path)", async () => {
    const agent = await prisma.agent.create({
      data: {
        name: "NC",
        username: "no-conn",
        role: "worker",
        workspaceId: WS,
        setupStatus: "active",
      },
    });
    const task = await prisma.task.create({
      data: { title: "x", description: "y", status: "assigned" },
    });
    await tryDeliverTaskToLiveAgents([agent.id], {
      taskId: task.id,
      taskTitle: "x",
      priority: "normal",
    });
    expect(await prisma.livePendingDelivery.count({ where: { taskId: task.id } })).toBe(0);
  });

  it("re-pushes a stale un-acked delivery to a live connection and bumps its attempts", async () => {
    const conn = await prisma.liveGatewayConnection.create({
      data: {
        machineFingerprint: "fp-redeliver",
        machineName: "m",
        connectionStatus: "connected",
        pluginVersion: "0.1.0",
        hostMeta: { hostname: "h", platform: "linux", arch: "x64" },
      },
    });
    const stale = await prisma.livePendingDelivery.create({
      data: {
        connectionId: conn.id,
        agentSlug: "a",
        taskId: "t-stale",
        message: "m",
        priority: "normal",
        idempotencyKey: "task:t-stale:agent:a",
        expiresAt: new Date(Date.now() + 3600_000),
        attempts: 1,
        lastAttemptAt: new Date(Date.now() - 120_000), // pushed 2 min ago, never acked → stale
      },
    });
    const fresh = await prisma.livePendingDelivery.create({
      data: {
        connectionId: conn.id,
        agentSlug: "a",
        taskId: "t-fresh",
        message: "m",
        priority: "normal",
        idempotencyKey: "task:t-fresh:agent:a",
        expiresAt: new Date(Date.now() + 3600_000),
        attempts: 1,
        lastAttemptAt: new Date(), // just pushed → not stale
      },
    });

    const sent: string[] = [];
    const n = await redeliverStalePending(new Date(), (connectionId) => {
      sent.push(connectionId);
      return true; // pretend the connection is live
    });

    expect(n).toBe(1);
    expect(sent).toEqual([conn.id]);
    expect(
      (await prisma.livePendingDelivery.findUniqueOrThrow({ where: { id: stale.id } })).attempts,
    ).toBe(2);
    expect(
      (await prisma.livePendingDelivery.findUniqueOrThrow({ where: { id: fresh.id } })).attempts,
    ).toBe(1);
  });

  it("does not count a re-push whose connection is offline", async () => {
    const conn = await prisma.liveGatewayConnection.create({
      data: {
        machineFingerprint: "fp-offline",
        machineName: "m",
        connectionStatus: "disconnected",
        pluginVersion: "0.1.0",
        hostMeta: { hostname: "h", platform: "linux", arch: "x64" },
      },
    });
    await prisma.livePendingDelivery.create({
      data: {
        connectionId: conn.id,
        agentSlug: "a",
        taskId: "t-off",
        message: "m",
        priority: "normal",
        idempotencyKey: "task:t-off:agent:a",
        expiresAt: new Date(Date.now() + 3600_000),
        attempts: 1,
        lastAttemptAt: new Date(Date.now() - 120_000),
      },
    });
    const n = await redeliverStalePending(new Date(), () => false); // connection not live
    expect(n).toBe(0);
  });
});
