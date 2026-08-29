import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { recordCostEvent } from "../../src/server/services/cost";
import { AUTO_PAUSE_MESSAGE } from "../../src/server/services/budget-enforcement";
import { windowBounds } from "../../src/server/services/budget-window";
import { createTestAgent, createTestProject, addProjectMember } from "../helpers";

/**
 * Epic #4 cost-obs finish — project-scoped budgets + lifetime window. Exercises the real services +
 * event bus + Postgres: a project budget accrues from cost attributed to that project, and a hard
 * breach pauses ONLY that project's member agents (not the whole workspace). The lifetime window
 * accrues all spend into a single perpetual QuotaWindow that never rolls over.
 */
const WS = "ws_proj_life";

async function makeAgent(name: string) {
  const { agent } = await createTestAgent({ name, status: "active" });
  await prisma.agent.update({ where: { id: agent.id }, data: { workspaceId: WS } });
  return agent.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE budget_incidents, quota_windows, budget_policies, cost_events, project_members, projects, profiles, agents CASCADE`,
  );
});

describe("project-scope budget", () => {
  it("accrues project cost and hard-breach pauses ONLY the project's member agents", async () => {
    const project = await createTestProject({ name: "Alpha" });
    await prisma.project.update({ where: { id: project.id }, data: { workspaceId: WS } });

    const memberAgent = await makeAgent("Member");
    const outsiderAgent = await makeAgent("Outsider");
    await addProjectMember(project.id, memberAgent);

    const policy = await prisma.budgetPolicy.create({
      data: {
        workspaceId: WS,
        scope: "project",
        projectId: project.id,
        name: "Alpha project cap",
        limitCents: 1000,
        window: "monthly",
        hardStop: true,
      },
    });

    // Cost attributed to the project by the member agent, over the limit → hard breach.
    await recordCostEvent({
      workspaceId: WS,
      agentId: memberAgent,
      projectId: project.id,
      amountCents: 1500,
    });

    // The project's QuotaWindow accrued the spend.
    const { windowStart } = windowBounds("monthly", new Date());
    const qw = await prisma.quotaWindow.findUnique({
      where: { policyId_windowStart: { policyId: policy.id, windowStart } },
    });
    expect(qw?.spendCents).toBe(1500);
    expect(qw?.breached).toBe(true);

    // Exactly one hard incident opened for the project policy.
    const incidents = await prisma.budgetIncident.findMany({ where: { policyId: policy.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].thresholdType).toBe("hard");
    expect(incidents[0].autoPaused).toBe(true);

    // Only the project member is paused; the outsider is untouched.
    const member = await prisma.agent.findUniqueOrThrow({ where: { id: memberAgent } });
    const outsider = await prisma.agent.findUniqueOrThrow({ where: { id: outsiderAgent } });
    expect(member.status).toBe("blocked");
    expect(member.statusMessage).toBe(AUTO_PAUSE_MESSAGE);
    expect(outsider.status).toBe("active");
  });

  it("does NOT accrue cost from a different project", async () => {
    const projA = await createTestProject({ name: "A" });
    const projB = await createTestProject({ name: "B" });
    await prisma.project.update({ where: { id: projA.id }, data: { workspaceId: WS } });
    await prisma.project.update({ where: { id: projB.id }, data: { workspaceId: WS } });

    const policy = await prisma.budgetPolicy.create({
      data: {
        workspaceId: WS,
        scope: "project",
        projectId: projA.id,
        name: "A cap",
        limitCents: 1_000_000,
        window: "monthly",
        hardStop: false,
      },
    });

    await recordCostEvent({ workspaceId: WS, projectId: projB.id, amountCents: 500 });

    const windows = await prisma.quotaWindow.findMany({ where: { policyId: policy.id } });
    expect(windows).toHaveLength(0); // project B's cost never touched project A's budget
  });
});

describe("lifetime window", () => {
  it("accrues all spend into a single never-rolling window across distant timestamps", async () => {
    const policy = await prisma.budgetPolicy.create({
      data: {
        workspaceId: WS,
        scope: "workspace",
        name: "Lifetime cap",
        limitCents: 1000,
        window: "lifetime",
        hardStop: false,
      },
    });

    // Two cost events months apart both land in the same lifetime window.
    await recordCostEvent({
      workspaceId: WS,
      amountCents: 400,
      occurredAt: new Date("2026-01-15T00:00:00Z"),
    });
    await recordCostEvent({
      workspaceId: WS,
      amountCents: 700,
      occurredAt: new Date("2026-08-15T00:00:00Z"),
    });

    const windows = await prisma.quotaWindow.findMany({ where: { policyId: policy.id } });
    expect(windows).toHaveLength(1);
    expect(windows[0].spendCents).toBe(1100);

    // The cumulative spend crossed the limit → a hard incident opened on the lifetime window.
    const incidents = await prisma.budgetIncident.findMany({ where: { policyId: policy.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].thresholdType).toBe("hard");
  });
});
