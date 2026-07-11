import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { recordCostEvent } from "../../src/server/services/cost";
import { raiseBudgetAndResume } from "../../src/server/services/budgets";
import { windowBounds } from "../../src/server/services/budget-window";
import { createTestAgent, createTestTask } from "../helpers";
import type { BudgetScope } from "@agentcenter/database";

/**
 * Epic #4 Paperclip parity — soft-warn, cancel-in-flight, budget_override approval, and the
 * raise-and-resume flow. Real services + event bus + Postgres.
 */
const WS = "ws_fin_parity";

async function makeAgent(name: string, withTask = false) {
  const { agent } = await createTestAgent({ name, status: "active" });
  const data: { workspaceId: string; currentTaskId?: string; currentTask?: string } = {
    workspaceId: WS,
  };
  if (withTask) {
    const task = await createTestTask(agent.id, { title: `${name} task` });
    data.currentTaskId = task.id;
    data.currentTask = task.title;
  }
  await prisma.agent.update({ where: { id: agent.id }, data });
  return agent.id;
}

async function makePolicy(opts: {
  scope: BudgetScope;
  agentId?: string;
  limitCents: number;
  hardStop: boolean;
  warnPercent?: number;
}) {
  return prisma.budgetPolicy.create({
    data: {
      workspaceId: WS,
      scope: opts.scope,
      agentId: opts.scope === "agent" ? opts.agentId : null,
      name: "parity policy",
      limitCents: opts.limitCents,
      window: "daily",
      hardStop: opts.hardStop,
      warnPercent: opts.warnPercent ?? 80,
    },
  });
}

async function makeHuman() {
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Budget Admin" } });
  return p.id;
}

const windowOf = (policyId: string) =>
  prisma.quotaWindow.findUnique({
    where: {
      policyId_windowStart: {
        policyId,
        windowStart: windowBounds("daily", new Date()).windowStart,
      },
    },
  });

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE approvals, budget_incidents, quota_windows, budget_policies, cost_events, agents, tasks, profiles CASCADE`,
  );
});

describe("soft warn", () => {
  it("opens a soft incident at warnPercent without pausing the agent", async () => {
    const agentId = await makeAgent("Soft");
    const policy = await makePolicy({
      scope: "agent",
      agentId,
      limitCents: 1000,
      hardStop: true,
      warnPercent: 80,
    });

    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 800 }); // == 80% of 1000

    const incidents = await prisma.budgetIncident.findMany({ where: { policyId: policy.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].thresholdType).toBe("soft");
    expect(incidents[0].autoPaused).toBe(false);

    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(agent.status).toBe("active"); // NOT paused on soft warn

    const qw = await windowOf(policy.id);
    expect(qw?.warned).toBe(true);
    expect(qw?.breached).toBe(false);
  });

  it("does not open a redundant soft incident when spend jumps straight past the hard limit", async () => {
    const agentId = await makeAgent("Jump");
    const policy = await makePolicy({ scope: "agent", agentId, limitCents: 1000, hardStop: true });

    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 1500 });

    const incidents = await prisma.budgetIncident.findMany({ where: { policyId: policy.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].thresholdType).toBe("hard");
  });

  it("opens a soft then a hard incident as spend crosses both thresholds", async () => {
    const agentId = await makeAgent("Gradual");
    const policy = await makePolicy({ scope: "agent", agentId, limitCents: 1000, hardStop: true });

    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 800 }); // soft
    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 300 }); // total 1100 → hard

    const incidents = await prisma.budgetIncident.findMany({
      where: { policyId: policy.id },
      orderBy: { createdAt: "asc" },
    });
    expect(incidents.map((i) => i.thresholdType)).toEqual(["soft", "hard"]);
    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(agent.status).toBe("blocked");
  });
});

describe("hard breach — cancel in-flight + approval", () => {
  it("clears the agent's current task and opens a budget_override approval", async () => {
    const agentId = await makeAgent("HardCancel", /* withTask */ true);
    const policy = await makePolicy({ scope: "agent", agentId, limitCents: 1000, hardStop: true });

    const before = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(before.currentTaskId).toBeTruthy();

    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 1200 });

    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(agent.status).toBe("blocked");
    expect(agent.currentTaskId).toBeNull(); // in-flight work cancelled

    const incident = await prisma.budgetIncident.findFirstOrThrow({
      where: { policyId: policy.id },
    });
    expect(incident.approvalId).toBeTruthy();
    const approval = await prisma.approval.findUniqueOrThrow({
      where: { id: incident.approvalId! },
    });
    expect(approval.subjectType).toBe("budget_override");
    expect(approval.subjectId).toBe(incident.id);
    expect(approval.status).toBe("pending");
  });
});

describe("raiseBudgetAndResume", () => {
  it("raises the limit above observed spend, resolves the incident + approval, reactivates the agent", async () => {
    const agentId = await makeAgent("Resume");
    const policy = await makePolicy({ scope: "agent", agentId, limitCents: 1000, hardStop: true });
    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 1500 });

    const incident = await prisma.budgetIncident.findFirstOrThrow({
      where: { policyId: policy.id, thresholdType: "hard" },
    });

    const humanId = await makeHuman();
    const resumed = await raiseBudgetAndResume({
      incidentId: incident.id,
      workspaceId: WS,
      newLimitCents: 2000,
      resolvedById: humanId,
    });

    expect(resumed.status).toBe("resolved");
    const updatedPolicy = await prisma.budgetPolicy.findUniqueOrThrow({ where: { id: policy.id } });
    expect(updatedPolicy.limitCents).toBe(2000);

    const qw = await windowOf(policy.id);
    expect(qw?.breached).toBe(false);
    expect(qw?.warned).toBe(false);

    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(agent.status).toBe("idle"); // reactivated
    expect(agent.statusMessage).toBeNull();

    const approval = await prisma.approval.findUniqueOrThrow({
      where: { id: incident.approvalId! },
    });
    expect(approval.status).toBe("approved");
  });

  it("rejects a new limit that does not exceed observed spend, leaving the agent blocked", async () => {
    const agentId = await makeAgent("NoResume");
    const policy = await makePolicy({ scope: "agent", agentId, limitCents: 1000, hardStop: true });
    await recordCostEvent({ workspaceId: WS, agentId, amountCents: 1500 });

    const incident = await prisma.budgetIncident.findFirstOrThrow({
      where: { policyId: policy.id, thresholdType: "hard" },
    });

    await expect(
      raiseBudgetAndResume({
        incidentId: incident.id,
        workspaceId: WS,
        newLimitCents: 1000, // <= observed (1500)
        resolvedById: "human_1",
      }),
    ).rejects.toThrow();

    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(agent.status).toBe("blocked"); // stays paused
    const stillOpen = await prisma.budgetIncident.findUniqueOrThrow({ where: { id: incident.id } });
    expect(stillOpen.status).toBe("open");
  });
});
