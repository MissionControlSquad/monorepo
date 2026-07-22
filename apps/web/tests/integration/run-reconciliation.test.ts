import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { reapOrphanedRuns, isRunOrphaned } from "../../src/server/services/run-reconciliation";

// Parity #73 — boot / hot-restart reaping of orphaned runs.
const WS = "ws_reap";

let agentSeq = 0;
async function makeAgent() {
  agentSeq += 1;
  return prisma.agent.create({
    data: {
      name: `Reap Agent ${agentSeq}`,
      role: "worker",
      personality: "x",
      workspaceId: WS,
      username: `reap-${Date.now()}-${agentSeq}`,
      setupStatus: "active",
      apiKeyHash: `mc_reap_${Date.now()}_${agentSeq}`,
    },
  });
}

beforeEach(async () => {
  const agents = await prisma.agent.findMany({ where: { workspaceId: WS }, select: { id: true } });
  await prisma.agentRun.deleteMany({ where: { agentId: { in: agents.map((a) => a.id) } } });
  await prisma.agent.deleteMany({ where: { workspaceId: WS } });
});

describe("isRunOrphaned (pure)", () => {
  it("only a running run past the stale window is orphaned", () => {
    const now = 1_000_000;
    expect(isRunOrphaned("running", new Date(now - 10_000), now, 5_000)).toBe(true);
    expect(isRunOrphaned("running", new Date(now - 1_000), now, 5_000)).toBe(false);
    expect(isRunOrphaned("done", new Date(now - 10_000), now, 5_000)).toBe(false);
  });
});

describe("reapOrphanedRuns (#73)", () => {
  it("reaps running rows to timeout and reports retry eligibility", async () => {
    const agent = await makeAgent();
    const running = await prisma.agentRun.create({
      data: { workspaceId: WS, agentId: agent.id, kind: "task", status: "running" },
    });
    const maxed = await prisma.agentRun.create({
      data: { workspaceId: WS, agentId: agent.id, kind: "task", status: "running", retryCount: 99 },
    });
    const done = await prisma.agentRun.create({
      data: { workspaceId: WS, agentId: agent.id, kind: "task", status: "done" },
    });

    const res = await reapOrphanedRuns({ workspaceId: WS });
    expect(res.reaped).toBe(2); // both running rows, not the done one
    expect(res.retryable).toContain(running.id);
    expect(res.retryable).not.toContain(maxed.id); // over the retry cap

    expect((await prisma.agentRun.findUnique({ where: { id: running.id } }))?.status).toBe(
      "timeout",
    );
    expect((await prisma.agentRun.findUnique({ where: { id: done.id } }))?.status).toBe("done");
  });

  it("respects the stale window for the periodic sweep", async () => {
    const agent = await makeAgent();
    const fresh = await prisma.agentRun.create({
      data: { workspaceId: WS, agentId: agent.id, kind: "task", status: "running" },
    });
    // fresh run, updatedAt ~ now → not reaped under a 10-min window
    expect((await reapOrphanedRuns({ workspaceId: WS, staleMs: 10 * 60_000 })).reaped).toBe(0);
    expect((await prisma.agentRun.findUnique({ where: { id: fresh.id } }))?.status).toBe("running");
  });
});
