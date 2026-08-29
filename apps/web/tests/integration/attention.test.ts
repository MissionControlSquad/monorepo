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
 * Epic #20 attention feed — real GraphQL route + Postgres. Computed, read-only, workspace-scoped.
 */
const SECRET = "attn-test-secret";
const WS_A = "ws_attn_A";
const WS_B = "ws_attn_B";
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
const FEED = `query{ attentionFeed{ totalCount countsBySourceKind items{ id sourceKind severity subjectId title } } }`;

/** Seed one of each attention source into a workspace. */
async function seed(ws: string) {
  await prisma.approval.create({
    data: {
      workspaceId: ws,
      subjectType: "task",
      subjectId: "s",
      title: "Approve deploy",
      requestedById: humanId,
      status: "pending",
    },
  });
  const policy = await prisma.budgetPolicy.create({
    data: { workspaceId: ws, scope: "workspace", name: "cap", limitCents: 1000 },
  });
  await prisma.budgetIncident.create({
    data: {
      workspaceId: ws,
      policyId: policy.id,
      spendCents: 1500,
      limitCents: 1000,
      status: "open",
      thresholdType: "hard",
    },
  });
  const project = await prisma.project.create({ data: { name: `${ws}-p`, workspaceId: ws } });
  await prisma.task.create({
    data: { title: "Stuck task", description: "d", status: "blocked", projectId: project.id },
  });
  // A cyclic org chain: a1 <-> a2.
  const a1 = await prisma.agent.create({ data: { name: "A1", role: "r", workspaceId: ws } });
  const a2 = await prisma.agent.create({ data: { name: "A2", role: "r", workspaceId: ws } });
  await prisma.agent.update({ where: { id: a1.id }, data: { reportsToAgentId: a2.id } });
  await prisma.agent.update({ where: { id: a2.id }, data: { reportsToAgentId: a1.id } });
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE attention_dismissals, budget_incidents, budget_policies, approvals, tasks, projects, agents, profiles CASCADE`,
  );
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Attn Human" } });
  humanId = p.id;
});

describe("dismissals (Epic #20b)", () => {
  const DISMISS = `mutation($k:String!){ dismissAttentionItem(itemKey:$k) }`;
  const UNDISMISS = `mutation($k:String!){ undismissAttentionItem(itemKey:$k) }`;
  const FEED_ALL = `query($inc:Boolean){ attentionFeed(includeDismissed:$inc){ totalCount items{ id } } }`;

  it("dismissing an item hides it from the feed; undismissing restores it", async () => {
    await seed(WS_A);
    const member = await cookieFor(WS_A, "member");
    const before = await gql(FEED, undefined, member);
    const target = before.data.attentionFeed.items[0].id; // the critical incident
    const n = before.data.attentionFeed.totalCount;

    await gql(DISMISS, { k: target }, member);
    const after = await gql(FEED, undefined, member);
    expect(after.data.attentionFeed.totalCount).toBe(n - 1);
    expect(after.data.attentionFeed.items.find((i: any) => i.id === target)).toBeUndefined();

    // includeDismissed shows it again.
    const all = await gql(FEED_ALL, { inc: true }, member);
    expect(all.data.attentionFeed.items.find((i: any) => i.id === target)).toBeDefined();

    // undismiss restores it to the default feed.
    await gql(UNDISMISS, { k: target }, member);
    const restored = await gql(FEED, undefined, member);
    expect(restored.data.attentionFeed.totalCount).toBe(n);
  });

  it("dismissals are workspace-isolated", async () => {
    await seed(WS_A);
    const itemId = (await gql(FEED, undefined, await cookieFor(WS_A, "member"))).data.attentionFeed
      .items[0].id;
    // dismiss in WS_B — must not affect WS_A.
    await gql(DISMISS, { k: itemId }, await cookieFor(WS_B, "member"));
    const a = await gql(FEED, undefined, await cookieFor(WS_A, "member"));
    expect(a.data.attentionFeed.items.find((i: any) => i.id === itemId)).toBeDefined();
  });
});

describe("attention feed (Epic #20)", () => {
  it("aggregates each source and ranks by severity (critical incident first)", async () => {
    await seed(WS_A);
    const r = await gql(FEED, undefined, await cookieFor(WS_A, "member"));
    expect(r.errors).toBeFalsy();
    const feed = r.data.attentionFeed;
    const kinds = feed.items.map((i: any) => i.sourceKind);
    expect(kinds).toContain("approval");
    expect(kinds).toContain("budget_alert");
    expect(kinds).toContain("blocker_attention");
    expect(kinds).toContain("agent_error_alert");
    // Critical hard-incident ranks first; the medium blocker ranks last.
    expect(feed.items[0].severity).toBe("critical");
    expect(feed.items[feed.items.length - 1].sourceKind).toBe("blocker_attention");
    expect(feed.countsBySourceKind.budget_alert).toBe(1);
  });

  it("excludes resolved/closed items", async () => {
    // A resolved incident + an approved approval + a done task → no attention items from them.
    const policy = await prisma.budgetPolicy.create({
      data: { workspaceId: WS_A, scope: "workspace", name: "cap", limitCents: 1000 },
    });
    await prisma.budgetIncident.create({
      data: {
        workspaceId: WS_A,
        policyId: policy.id,
        spendCents: 1500,
        limitCents: 1000,
        status: "resolved",
      },
    });
    await prisma.approval.create({
      data: {
        workspaceId: WS_A,
        subjectType: "task",
        subjectId: "s",
        title: "old",
        requestedById: humanId,
        status: "approved",
      },
    });
    const r = await gql(FEED, undefined, await cookieFor(WS_A, "member"));
    expect(r.data.attentionFeed.totalCount).toBe(0);
  });

  it("is workspace-isolated", async () => {
    await seed(WS_B);
    const r = await gql(FEED, undefined, await cookieFor(WS_A, "member"));
    expect(r.data.attentionFeed.totalCount).toBe(0);
  });

  it("rejects access when ATTENTION is off", async () => {
    try {
      setTestFeature(FLAG_KEYS.ATTENTION, false);
      invalidateFlagCache();
      const r = await gql(FEED, undefined, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature(FLAG_KEYS.ATTENTION);
      invalidateFlagCache();
    }
  });
});
