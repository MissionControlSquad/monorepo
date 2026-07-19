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
    `TRUNCATE TABLE budget_incidents, quota_windows, budget_policies, cost_events, finance_events, agents CASCADE`,
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

  it("splits spend by billing type (api vs subscription) in costBreakdown", async () => {
    const admin = await cookieFor(WS_A, "admin");
    await runGraphQL(
      `mutation{ ingestCostEvent(amountCents:300, billingType:"api"){ id billingType } }`,
      undefined,
      admin,
    );
    await runGraphQL(
      `mutation{ ingestCostEvent(amountCents:1000, billingType:"subscription"){ id billingType } }`,
      undefined,
      admin,
    );
    // an unspecified event defaults to api
    await runGraphQL(
      `mutation{ ingestCostEvent(amountCents:200){ id billingType } }`,
      undefined,
      admin,
    );

    const bd = await runGraphQL(
      `query{ costBreakdown(groupBy:"billingType"){ key amountCents eventCount } }`,
      undefined,
      admin,
    );
    expect(bd.errors).toBeFalsy();
    const byKey = Object.fromEntries(
      (bd.data.costBreakdown as { key: string; amountCents: number; eventCount: number }[]).map(
        (b) => [b.key, b],
      ),
    );
    expect(byKey.api).toMatchObject({ amountCents: 500, eventCount: 2 }); // 300 + 200 default
    expect(byKey.subscription).toMatchObject({ amountCents: 1000, eventCount: 1 });
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

describe("non-inference finance ledger (Domain 12 GAP-1)", () => {
  const INGEST = `mutation($k:String!,$a:Int!,$d:String,$b:String,$idem:String){
    ingestFinanceEvent(eventKind:$k, amountCents:$a, direction:$d, biller:$b, idempotencyKey:$idem){
      id eventKind direction amountCents biller
    }
  }`;

  it("admin ingests debit/credit events; member cannot ingest", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const member = await cookieFor(WS_A, "member");

    const denied = await runGraphQL(INGEST, { k: "platform_fee", a: 500 }, member);
    expect(denied.errors).toBeDefined();

    const fee = await runGraphQL(
      INGEST,
      { k: "platform_fee", a: 500, d: "debit", b: "acme" },
      admin,
    );
    expect(fee.data.ingestFinanceEvent).toMatchObject({
      eventKind: "platform_fee",
      direction: "debit",
      amountCents: 500,
      biller: "acme",
    });

    const credit = await runGraphQL(INGEST, { k: "credit_purchase", a: 2000, d: "credit" }, admin);
    expect(credit.data.ingestFinanceEvent.direction).toBe("credit");

    // an unknown kind is rejected
    const bad = await runGraphQL(INGEST, { k: "not_a_kind", a: 100 }, admin);
    expect(bad.errors).toBeDefined();
  });

  it("summary nets debit − credit; by-biller / by-kind group; idempotency dedupes", async () => {
    const admin = await cookieFor(WS_A, "admin");
    await runGraphQL(INGEST, { k: "platform_fee", a: 1000, d: "debit", b: "acme" }, admin);
    await runGraphQL(INGEST, { k: "storage_charge", a: 250, d: "debit", b: "acme" }, admin);
    await runGraphQL(INGEST, { k: "credit_purchase", a: 400, d: "credit", b: "stripe" }, admin);
    // idempotent replay — must not double-count
    await runGraphQL(
      INGEST,
      { k: "platform_fee", a: 1000, d: "debit", b: "acme", idem: "dup1" },
      admin,
    );
    await runGraphQL(
      INGEST,
      { k: "platform_fee", a: 1000, d: "debit", b: "acme", idem: "dup1" },
      admin,
    );

    const summary = await runGraphQL(
      `query{ financeEventSummary{ debitCents creditCents netCents count } }`,
      undefined,
      admin,
    );
    // debits: 1000 + 250 + 1000(dedup once) = 2250 ; credits: 400 ; net: 1850 ; count 4
    expect(summary.data.financeEventSummary).toMatchObject({
      debitCents: 2250,
      creditCents: 400,
      netCents: 1850,
      count: 4,
    });

    const byBiller = await runGraphQL(
      `query{ financeEventsByBiller{ key netCents count } }`,
      undefined,
      admin,
    );
    const acme = byBiller.data.financeEventsByBiller.find((g: any) => g.key === "acme");
    expect(acme).toMatchObject({ netCents: 2250, count: 3 });

    const byKind = await runGraphQL(`query{ financeEventsByKind{ key count } }`, undefined, admin);
    const fee = byKind.data.financeEventsByKind.find((g: any) => g.key === "platform_fee");
    expect(fee.count).toBe(2);
  });

  it("is workspace-scoped — one workspace never sees another's finance events", async () => {
    await runGraphQL(
      INGEST,
      { k: "platform_fee", a: 999, d: "debit" },
      await cookieFor(WS_A, "admin"),
    );
    const other = await runGraphQL(
      `query{ financeEventSummary{ debitCents count } }`,
      undefined,
      await cookieFor(WS_B, "admin"),
    );
    expect(other.data.financeEventSummary).toMatchObject({ debitCents: 0, count: 0 });
  });
});

describe("rolling window spend (Domain 12 GAP-6 A10)", () => {
  it("aggregates per-provider spend over 5h/24h/7d from cost events", async () => {
    const admin = await cookieFor(WS_A, "admin");
    // recent event (within 5h) + an older one (within 7d) for the same provider
    await runGraphQL(
      `mutation{ ingestCostEvent(amountCents:100, provider:"anthropic"){ id } }`,
      undefined,
      admin,
    );
    // backdate a second event 3 days old directly
    const old = await prisma.costEvent.create({
      data: {
        workspaceId: WS_A,
        provider: "anthropic",
        amountCents: 25,
        occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
    expect(old.id).toBeTruthy();

    const r = await runGraphQL(
      `query{ costWindowSpend{ provider window amountCents eventCount } }`,
      undefined,
      admin,
    );
    expect(r.errors).toBeFalsy();
    const rows = r.data.costWindowSpend as {
      provider: string;
      window: string;
      amountCents: number;
    }[];
    const byWindow = Object.fromEntries(
      rows.filter((x) => x.provider === "anthropic").map((x) => [x.window, x.amountCents]),
    );
    expect(byWindow["5h"]).toBe(100); // only the recent one
    expect(byWindow["7d"]).toBe(125); // both
  });
});
