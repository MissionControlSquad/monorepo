import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";

/**
 * Epic #13 observability summary — real GraphQL route + Postgres. Read-only workspace rollup.
 */
const SECRET = "obs-test-secret";
const WS_A = "ws_obs_A";
const WS_B = "ws_obs_B";
let humanId = "";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text
    ? (JSON.parse(text) as { data?: any; errors?: { message: string }[] })
    : { errors: [{ message: "empty" }] };
}
async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: humanId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}
const SUMMARY = `query{ workspaceSummary{ agents{ total operational blocked idle active } tasks{ total open inProgress done blocked } monthSpendCents pendingApprovals activeBudgetIncidents } }`;

/** Seed a workspace: agents by status, project + tasks by status, an approval, cost events, incident. */
async function seed(ws: string, opts?: { lastMonthCost?: boolean }) {
  await prisma.agent.createMany({
    data: [
      { name: `${ws}-a1`, role: "r", workspaceId: ws, status: "idle" },
      { name: `${ws}-a2`, role: "r", workspaceId: ws, status: "active" },
      { name: `${ws}-a3`, role: "r", workspaceId: ws, status: "blocked" },
    ],
  });
  const project = await prisma.project.create({ data: { name: `${ws}-p`, workspaceId: ws } });
  await prisma.task.createMany({
    data: [
      { title: "t1", description: "d", status: "inbox", projectId: project.id },
      { title: "t2", description: "d", status: "in_progress", projectId: project.id },
      { title: "t3", description: "d", status: "done", projectId: project.id },
    ],
  });
  await prisma.approval.create({
    data: {
      workspaceId: ws,
      subjectType: "task",
      subjectId: "x",
      title: "needs sign-off",
      requestedById: humanId,
      status: "pending",
    },
  });
  await prisma.costEvent.create({
    data: { workspaceId: ws, amountCents: 500, occurredAt: new Date() },
  });
  if (opts?.lastMonthCost) {
    // ~40 days ago — must be excluded from month-to-date spend.
    await prisma.costEvent.create({
      data: {
        workspaceId: ws,
        amountCents: 9999,
        occurredAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      },
    });
  }
  const policy = await prisma.budgetPolicy.create({
    data: { workspaceId: ws, scope: "workspace", name: "cap", limitCents: 1000 },
  });
  await prisma.budgetIncident.create({
    data: {
      workspaceId: ws,
      policyId: policy.id,
      spendCents: 1200,
      limitCents: 1000,
      status: "open",
    },
  });
  await prisma.budgetIncident.create({
    data: {
      workspaceId: ws,
      policyId: policy.id,
      spendCents: 1100,
      limitCents: 1000,
      status: "resolved",
    },
  });
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE budget_incidents, budget_policies, cost_events, approvals, tasks, projects, agents, profiles CASCADE`,
  );
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Obs Human" } });
  humanId = p.id;
});

describe("workspace summary (Epic #13)", () => {
  it("rolls up agents, tasks, approvals, spend, and open incidents", async () => {
    await seed(WS_A);
    const r = await gql(SUMMARY, undefined, await cookieFor(WS_A, "member"));
    expect(r.errors).toBeFalsy();
    const s = r.data.workspaceSummary;
    expect(s.agents).toMatchObject({ total: 3, operational: 2, blocked: 1, idle: 1, active: 1 });
    expect(s.tasks).toMatchObject({ total: 3, open: 2, inProgress: 1, done: 1 });
    expect(s.monthSpendCents).toBe(500);
    expect(s.pendingApprovals).toBe(1);
    expect(s.activeBudgetIncidents).toBe(1); // resolved one excluded
  });

  it("month spend excludes last-month cost events", async () => {
    await seed(WS_A, { lastMonthCost: true });
    const r = await gql(SUMMARY, undefined, await cookieFor(WS_A, "member"));
    // 500 this month; the 9999 from ~40 days ago must not be counted (unless run in the first days
    // of a month where 40 days ago is still... no — 40 days always crosses a month boundary).
    expect(r.data.workspaceSummary.monthSpendCents).toBe(500);
  });

  it("is workspace-isolated — WS_A summary ignores WS_B rows", async () => {
    await seed(WS_B);
    const r = await gql(SUMMARY, undefined, await cookieFor(WS_A, "member"));
    const s = r.data.workspaceSummary;
    expect(s.agents.total).toBe(0);
    expect(s.tasks.total).toBe(0);
    expect(s.pendingApprovals).toBe(0);
    expect(s.activeBudgetIncidents).toBe(0);
    expect(s.monthSpendCents).toBe(0);
  });

  it("rejects access when OBSERVABILITY is off", async () => {
    try {
      setTestFeature(FLAG_KEYS.OBSERVABILITY, false);
      invalidateFlagCache();
      const r = await gql(SUMMARY, undefined, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature(FLAG_KEYS.OBSERVABILITY);
      invalidateFlagCache();
    }
  });
});
