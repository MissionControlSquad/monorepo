import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";

/**
 * Epic #4 route-level integration — real GraphQL route (schema + resolvers + DB), with human
 * auth simulated via a signed bb-workspace-token cookie (Epic #1 resolveTenancy). Covers the
 * BUDGETS feature gate, admin/member RBAC, cross-workspace isolation, and cost ingestion.
 */
const SECRET = "fin-test-secret";
const WS_A = "ws_fin_A";
const WS_B = "ws_fin_B";

async function runGraphQL(query: string, variables?: Record<string, unknown>, cookie?: string) {
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
  const token = await createJWT({ userId: "human_" + role, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE budget_incidents, quota_windows, budget_policies, cost_events, agents CASCADE`,
  );
});

describe("budget policy RBAC (Epic #4)", () => {
  const CREATE = `mutation($n:String!){ createBudgetPolicy(scope:"workspace", name:$n, limitCents:1000, window:"monthly", hardStop:true){ id scope limitCents workspaceId } }`;

  it("member cannot create a policy; admin can", async () => {
    const denied = await runGraphQL(CREATE, { n: "p" }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined();
    expect(denied.data?.createBudgetPolicy).toBeFalsy();

    const ok = await runGraphQL(CREATE, { n: "p" }, await cookieFor(WS_A, "admin"));
    expect(ok.errors).toBeFalsy();
    expect(ok.data.createBudgetPolicy.workspaceId).toBe(WS_A);
    expect(ok.data.createBudgetPolicy.limitCents).toBe(1000);
  });

  it("unauthenticated request is denied", async () => {
    const r = await runGraphQL(`query{ budgetPolicies{ id } }`);
    expect(r.errors).toBeDefined();
    expect(r.data?.budgetPolicies).toBeFalsy();
  });
});

describe("cross-workspace isolation (Epic #4)", () => {
  it("workspace B cannot see workspace A's policy", async () => {
    const created = await runGraphQL(
      `mutation{ createBudgetPolicy(scope:"workspace", name:"A-only", limitCents:5000, window:"monthly"){ id } }`,
      undefined,
      await cookieFor(WS_A, "admin"),
    );
    const idA = created.data.createBudgetPolicy.id;

    const list = await runGraphQL(
      `query{ budgetPolicies{ id workspaceId } }`,
      undefined,
      await cookieFor(WS_B, "admin"),
    );
    expect(list.errors).toBeFalsy();
    const ids = (list.data.budgetPolicies as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(idA);

    const single = await runGraphQL(
      `query($id:String!){ budgetPolicy(id:$id){ id } }`,
      { id: idA },
      await cookieFor(WS_B, "admin"),
    );
    expect(single.data.budgetPolicy).toBeNull();
  });
});

describe("cost ingestion + summary (Epic #4)", () => {
  it("ingestCostEvent persists and financeSummary reflects the spend", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const ing = await runGraphQL(
      `mutation{ ingestCostEvent(amountCents:750, model:"claude-opus-4-8", provider:"anthropic", source:"manual"){ id amountCents source } }`,
      undefined,
      admin,
    );
    expect(ing.errors).toBeFalsy();
    expect(ing.data.ingestCostEvent.amountCents).toBe(750);

    const rowCount = await prisma.costEvent.count({ where: { workspaceId: WS_A } });
    expect(rowCount).toBe(1);

    const summary = await runGraphQL(
      `query{ financeSummary(window:"monthly"){ totalSpendCents windowSpendCents } }`,
      undefined,
      admin,
    );
    expect(summary.data.financeSummary.totalSpendCents).toBe(750);
    expect(summary.data.financeSummary.windowSpendCents).toBe(750);
  });
});

describe("BUDGETS feature gate (Epic #4)", () => {
  it("budgetPolicies is rejected when the feature is off", async () => {
    const admin = await cookieFor(WS_A, "admin");
    try {
      await prisma.featureFlag.upsert({
        where: { key: "budgets" },
        create: { key: "budgets", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();

      const r = await runGraphQL(`query{ budgetPolicies{ id } }`, undefined, admin);
      expect(r.errors).toBeDefined();
      expect(r.errors!.length).toBeGreaterThan(0);
      expect(r.data?.budgetPolicies).toBeFalsy();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "budgets" } });
      invalidateFlagCache();
    }
  });
});
