import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { recordCostEvent } from "../../src/server/services/cost";
import { AUTO_PAUSE_MESSAGE } from "../../src/server/services/budget-enforcement";
import { resolveBudgetIncident as resolveIncidentSvc } from "../../src/server/services/budgets";
import { windowBounds } from "../../src/server/services/budget-window";
import { createTestAgent } from "../helpers";
import type { BudgetScope, BudgetWindow } from "@agentcenter/database";

/**
 * Epic #4 integration — cost recording, atomic increment, breach + auto-pause, resolve.
 * Exercises the real services + event bus + Postgres (emit awaits its handlers, so breach
 * and pause have already run by the time recordCostEvent resolves).
 */
const WS = "ws_fin_enf";

async function makeAgent(name: string, workspaceId = WS) {
  const { agent } = await createTestAgent({ name, status: "active" });
  await prisma.agent.update({ where: { id: agent.id }, data: { workspaceId } });
  return agent.id;
}

async function makePolicy(opts: {
  scope: BudgetScope;
  agentId?: string;
  limitCents: number;
  hardStop: boolean;
  window?: BudgetWindow;
  workspaceId?: string;
  name?: string;
}) {
  return prisma.budgetPolicy.create({
    data: {
      workspaceId: opts.workspaceId ?? WS,
      scope: opts.scope,
      agentId: opts.scope === "agent" ? opts.agentId : null,
      name: opts.name ?? "test policy",
      limitCents: opts.limitCents,
      window: opts.window ?? "daily",
      hardStop: opts.hardStop,
    },
  });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE budget_incidents, quota_windows, budget_policies, cost_events, agents CASCADE`,
  );
});

describe("recordCostEvent — increment fan-out", () => {
  it("increments the matching workspace + agent policies, skips a non-matching agent policy", async () => {
    const agentA = await makeAgent("A");
    const agentB = await makeAgent("B");
    const wsPolicy = await makePolicy({
      scope: "workspace",
      limitCents: 1_000_000,
      hardStop: false,
    });
    const aPolicy = await makePolicy({
      scope: "agent",
      agentId: agentA,
      limitCents: 1_000_000,
      hardStop: false,
    });
    const bPolicy = await makePolicy({
      scope: "agent",
      agentId: agentB,
      limitCents: 1_000_000,
      hardStop: false,
    });

    await recordCostEvent({ workspaceId: WS, agentId: agentA, amountCents: 500 });

    const now = new Date();
    const spendFor = async (policyId: string) => {
      const { windowStart } = windowBounds("daily", now);
      const qw = await prisma.quotaWindow.findUnique({
        where: { policyId_windowStart: { policyId, windowStart } },
      });
      return qw?.spendCents ?? 0;
    };

    expect(await spendFor(wsPolicy.id)).toBe(500); // workspace policy caught it
    expect(await spendFor(aPolicy.id)).toBe(500); // agent A policy caught it
    expect(await spendFor(bPolicy.id)).toBe(0); // agent B untouched
  });

  it("is idempotent on duplicate idempotencyKey — records once, increments once", async () => {
    const policy = await makePolicy({ scope: "workspace", limitCents: 1_000_000, hardStop: false });
    await recordCostEvent({ workspaceId: WS, amountCents: 300, idempotencyKey: "k1" });
    await recordCostEvent({ workspaceId: WS, amountCents: 300, idempotencyKey: "k1" });

    const events = await prisma.costEvent.count({ where: { workspaceId: WS } });
    expect(events).toBe(1);

    const { windowStart } = windowBounds("daily", new Date());
    const qw = await prisma.quotaWindow.findUnique({
      where: { policyId_windowStart: { policyId: policy.id, windowStart } },
    });
    expect(qw?.spendCents).toBe(300);
  });

  it("increments atomically under concurrency (20×100 → 2000, single window row)", async () => {
    const policy = await makePolicy({
      scope: "workspace",
      limitCents: 10_000_000,
      hardStop: false,
    });
    await Promise.all(
      Array.from({ length: 20 }, () => recordCostEvent({ workspaceId: WS, amountCents: 100 })),
    );
    const windows = await prisma.quotaWindow.findMany({ where: { policyId: policy.id } });
    expect(windows).toHaveLength(1);
    expect(windows[0].spendCents).toBe(2000);
  });
});

describe("breach + auto-pause", () => {
  it("hardStop=true pauses the agent, opens one autoPaused incident, marks window breached", async () => {
    const agentId = await makeAgent("HS");
    const policy = await makePolicy({
      scope: "agent",
      agentId,
      limitCents: 1000,
      hardStop: true,
    });

    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 1500 });

    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(agent.status).toBe("blocked");
    expect(agent.statusMessage).toBe(AUTO_PAUSE_MESSAGE);

    const incidents = await prisma.budgetIncident.findMany({ where: { policyId: policy.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].status).toBe("open");
    expect(incidents[0].autoPaused).toBe(true);

    const { windowStart } = windowBounds("daily", new Date());
    const qw = await prisma.quotaWindow.findUnique({
      where: { policyId_windowStart: { policyId: policy.id, windowStart } },
    });
    expect(qw?.breached).toBe(true);
  });

  it("hardStop=false records the breach incident but never pauses", async () => {
    const agentId = await makeAgent("Soft");
    const policy = await makePolicy({
      scope: "agent",
      agentId,
      limitCents: 1000,
      hardStop: false,
    });

    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 1500 });

    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(agent.status).toBe("active"); // untouched
    const incidents = await prisma.budgetIncident.findMany({ where: { policyId: policy.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].autoPaused).toBe(false);
  });

  it("workspace-scope hardStop pauses every active agent in the workspace", async () => {
    const a1 = await makeAgent("W1");
    const a2 = await makeAgent("W2");
    await makePolicy({ scope: "workspace", limitCents: 1000, hardStop: true });

    await recordCostEvent({ workspaceId: WS, agentId: a1, amountCents: 1500 });

    const [ag1, ag2] = await Promise.all([
      prisma.agent.findUniqueOrThrow({ where: { id: a1 } }),
      prisma.agent.findUniqueOrThrow({ where: { id: a2 } }),
    ]);
    expect(ag1.status).toBe("blocked");
    expect(ag2.status).toBe("blocked");
  });

  it("does not open a second incident once the window is already breached", async () => {
    const agentId = await makeAgent("Idem");
    const policy = await makePolicy({ scope: "agent", agentId, limitCents: 1000, hardStop: true });

    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 1500 });
    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 800 });

    const incidents = await prisma.budgetIncident.findMany({ where: { policyId: policy.id } });
    expect(incidents).toHaveLength(1);
  });
});

describe("resolveBudgetIncident", () => {
  it("resolves the incident without unpausing the agent", async () => {
    const agentId = await makeAgent("Res");
    const policy = await makePolicy({ scope: "agent", agentId, limitCents: 1000, hardStop: true });
    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 1500 });

    const human = await prisma.profile.create({
      data: { kind: "human", displayName: "Resolver" },
    });
    const open = await prisma.budgetIncident.findFirstOrThrow({ where: { policyId: policy.id } });
    const resolved = await resolveIncidentSvc({
      incidentId: open.id,
      workspaceId: WS,
      resolvedById: human.id,
      detail: "reviewed",
    });

    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedById).toBe(human.id);
    expect(resolved.resolvedAt).toBeTruthy();

    // Agent stays blocked — reactivation is a separate explicit action (R9).
    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(agent.status).toBe("blocked");
  });
});
