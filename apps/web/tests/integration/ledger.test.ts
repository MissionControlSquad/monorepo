import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";

/**
 * Epic #16 business ledger — real GraphQL route (schema + resolvers + Postgres), human auth via a
 * signed bb-workspace-token cookie (Epic #1). Covers RBAC, feature gate, workspace isolation,
 * summaries/aggregates, timeline zero-fill, pagination, and category rules.
 */
const SECRET = "ledger-test-secret";
const WS_A = "ws_ledger_A";
const WS_B = "ws_ledger_B";

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
  const token = await createJWT({ userId: "human_" + role, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

const CREATE = `mutation($k:String!,$c:String!,$a:Int!,$b:String,$o:DateTime!){
  createLedgerEvent(kind:$k, category:$c, biller:$b, amountCents:$a, occurredAt:$o){ id kind category amountCents currency workspaceId createdBy source } }`;

async function record(
  ws: string,
  kind: string,
  category: string,
  amountCents: number,
  occurredAt: string,
  biller?: string,
) {
  return gql(
    CREATE,
    { k: kind, c: category, a: amountCents, b: biller ?? null, o: occurredAt },
    await cookieFor(ws, "admin"),
  );
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ledger_events, ledger_categories CASCADE`);
});

describe("RBAC + create (Epic #16)", () => {
  it("admin creates an event with ctx-derived workspace/creator and integer cents", async () => {
    const r = await record(WS_A, "expense", "SaaS", 2500, "2026-03-10T00:00:00.000Z", "AWS");
    expect(r.errors).toBeFalsy();
    expect(r.data.createLedgerEvent.workspaceId).toBe(WS_A);
    expect(r.data.createLedgerEvent.amountCents).toBe(2500);
    expect(r.data.createLedgerEvent.currency).toBe("USD");
    expect(r.data.createLedgerEvent.createdBy).toBe("human_admin");
    expect(r.data.createLedgerEvent.source).toBe("manual");
  });

  it("member cannot create", async () => {
    const r = await gql(
      CREATE,
      { k: "revenue", c: "Sales", a: 100, b: null, o: "2026-03-10T00:00:00.000Z" },
      await cookieFor(WS_A, "member"),
    );
    expect(r.errors).toBeDefined();
    expect(r.data?.createLedgerEvent).toBeFalsy();
  });

  it("rejects non-positive amountCents", async () => {
    const r = await record(WS_A, "expense", "SaaS", 0, "2026-03-10T00:00:00.000Z");
    expect(r.errors).toBeDefined();
    expect(r.data?.createLedgerEvent).toBeFalsy();
  });
});

describe("summary + aggregates (Epic #16)", () => {
  beforeEach(async () => {
    await record(WS_A, "revenue", "Sales", 10000, "2026-03-05T00:00:00.000Z", "Acme");
    await record(WS_A, "revenue", "Sales", 55, "2026-03-06T00:00:00.000Z", "Acme");
    await record(WS_A, "expense", "SaaS", 6000, "2026-03-07T00:00:00.000Z", "AWS");
    await record(WS_A, "expense", "Misc", 400, "2026-03-08T00:00:00.000Z"); // null biller
  });

  it("financeSummary nets exactly in integer cents", async () => {
    const r = await gql(
      `query{ ledgerSummary{ revenueCents expenseCents netCents eventCount currency } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(r.data.ledgerSummary).toEqual({
      revenueCents: 10055,
      expenseCents: 6400,
      netCents: 3655,
      eventCount: 4,
      currency: "USD",
    });
  });

  it("byKind totals", async () => {
    const r = await gql(
      `query{ ledgerByKind{ kind totalCents eventCount } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    const map = Object.fromEntries(r.data.ledgerByKind.map((x: any) => [x.kind, x]));
    expect(map.revenue).toMatchObject({ totalCents: 10055, eventCount: 2 });
    expect(map.expense).toMatchObject({ totalCents: 6400, eventCount: 2 });
  });

  it("byBiller maps null → (unspecified) and orders by net desc", async () => {
    const r = await gql(
      `query{ ledgerByBiller{ biller revenueCents expenseCents netCents eventCount } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    const rows = r.data.ledgerByBiller as any[];
    expect(rows[0].biller).toBe("Acme"); // net +10055, highest
    expect(rows.map((x) => x.netCents)).toEqual(
      [...rows.map((x) => x.netCents)].sort((a, b) => b - a),
    );
    expect(rows.some((x) => x.biller === "(unspecified)")).toBe(true);
  });

  it("byCategory groups by (category, kind)", async () => {
    const r = await gql(
      `query{ ledgerByCategory{ category kind totalCents eventCount } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    const sales = (r.data.ledgerByCategory as any[]).find((x) => x.category === "Sales");
    expect(sales).toMatchObject({ kind: "revenue", totalCents: 10055, eventCount: 2 });
  });

  it("byProject nets revenue−expense per linked project and labels unlinked as (no project)", async () => {
    const project = await prisma.project.create({
      data: { workspaceId: WS_A, name: "Website Rebuild" },
    });
    const admin = await cookieFor(WS_A, "admin");
    const withProject = `mutation($k:String!,$c:String!,$a:Int!,$o:DateTime!,$p:String!){
      createLedgerEvent(kind:$k, category:$c, amountCents:$a, occurredAt:$o, projectId:$p){ id } }`;
    await gql(
      withProject,
      { k: "revenue", c: "Sales", a: 30000, o: "2026-03-09T00:00:00.000Z", p: project.id },
      admin,
    );
    await gql(
      withProject,
      { k: "expense", c: "SaaS", a: 12000, o: "2026-03-09T00:00:00.000Z", p: project.id },
      admin,
    );

    const r = await gql(
      `query{ ledgerByProject{ projectId projectName revenueCents expenseCents netCents eventCount } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    const rows = r.data.ledgerByProject as any[];
    const linked = rows.find((x) => x.projectId === project.id);
    expect(linked).toMatchObject({
      projectName: "Website Rebuild",
      revenueCents: 30000,
      expenseCents: 12000,
      netCents: 18000,
      eventCount: 2,
    });
    // The base events (no projectId) roll up under a (no project) bucket.
    const unlinked = rows.find((x) => x.projectId === null);
    expect(unlinked?.projectName).toBe("(no project)");
    // Sorted by net descending.
    expect(rows.map((x) => x.netCents)).toEqual(
      [...rows.map((x) => x.netCents)].sort((a, b) => b - a),
    );
  });

  it("range filter restricts the summary window", async () => {
    const r = await gql(
      `query($f:DateTime,$t:DateTime){ ledgerSummary(from:$f,to:$t){ revenueCents expenseCents } }`,
      { f: "2026-03-06T00:00:00.000Z", t: "2026-03-07T23:59:59.000Z" },
      await cookieFor(WS_A, "member"),
    );
    // Only the 55 revenue (3/6) and 6000 expense (3/7) fall in range.
    expect(r.data.ledgerSummary).toEqual({ revenueCents: 55, expenseCents: 6000 });
  });
});

describe("timeline zero-fill (Epic #16)", () => {
  it("fills empty daily buckets with zeros", async () => {
    await record(WS_A, "revenue", "Sales", 500, "2026-03-11T09:00:00.000Z");
    await record(WS_A, "expense", "SaaS", 200, "2026-03-13T09:00:00.000Z");
    const r = await gql(
      `query($f:DateTime,$t:DateTime){ ledgerTimeline(from:$f,to:$t,bucket:"day"){ bucketStart revenueCents expenseCents netCents } }`,
      { f: "2026-03-11T00:00:00.000Z", t: "2026-03-13T23:59:59.000Z" },
      await cookieFor(WS_A, "member"),
    );
    const pts = r.data.ledgerTimeline as any[];
    expect(pts).toHaveLength(3);
    expect(pts[0]).toMatchObject({ revenueCents: 500, expenseCents: 0, netCents: 500 });
    expect(pts[1]).toMatchObject({ revenueCents: 0, expenseCents: 0, netCents: 0 }); // empty middle day
    expect(pts[2]).toMatchObject({ revenueCents: 0, expenseCents: 200, netCents: -200 });
  });
});

describe("pagination + filters (Epic #16)", () => {
  it("paginates by cursor with filters, no overlap", async () => {
    const admin = await cookieFor(WS_A, "admin");
    for (let i = 0; i < 5; i++) {
      await gql(
        CREATE,
        {
          k: "expense",
          c: "Cloud",
          a: 100 + i,
          b: "AWS",
          o: `2026-03-0${i + 1}T00:00:00.000Z`,
        },
        admin,
      );
    }
    await record(WS_A, "revenue", "Sales", 999, "2026-03-09T00:00:00.000Z"); // filtered out
    const member = await cookieFor(WS_A, "member");
    const p1 = await gql(
      `query{ ledgerEvents(kind:"expense", biller:"AWS", limit:2){ events{ id amountCents } nextCursor } }`,
      undefined,
      member,
    );
    expect(p1.data.ledgerEvents.events).toHaveLength(2);
    expect(p1.data.ledgerEvents.nextCursor).toBeTruthy();
    const p2 = await gql(
      `query($c:String){ ledgerEvents(kind:"expense", biller:"AWS", limit:2, cursor:$c){ events{ id } nextCursor } }`,
      { c: p1.data.ledgerEvents.nextCursor },
      member,
    );
    const ids1 = p1.data.ledgerEvents.events.map((e: any) => e.id);
    const ids2 = p2.data.ledgerEvents.events.map((e: any) => e.id);
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0); // no overlap
  });
});

describe("categories (Epic #16)", () => {
  it("enforces per-workspace unique, hides archived, isolates across workspaces", async () => {
    const adminA = await cookieFor(WS_A, "admin");
    const mk = `mutation($k:String!,$n:String!){ createLedgerCategory(kind:$k, name:$n){ id name archived } }`;
    const c1 = await gql(mk, { k: "expense", n: "SaaS" }, adminA);
    expect(c1.errors).toBeFalsy();
    const dup = await gql(mk, { k: "expense", n: "SaaS" }, adminA);
    expect(dup.errors).toBeDefined(); // unique (workspace, kind, name)

    // Same name allowed in workspace B.
    const cB = await gql(mk, { k: "expense", n: "SaaS" }, await cookieFor(WS_B, "admin"));
    expect(cB.errors).toBeFalsy();

    // Archive → hidden by default, visible with includeArchived.
    await gql(
      `mutation($id:String!){ updateLedgerCategory(id:$id, archived:true){ id archived } }`,
      { id: c1.data.createLedgerCategory.id },
      adminA,
    );
    const visible = await gql(
      `query{ ledgerCategories{ id } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(visible.data.ledgerCategories).toHaveLength(0);
    const all = await gql(
      `query{ ledgerCategories(includeArchived:true){ id } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(all.data.ledgerCategories).toHaveLength(1);
  });
});

describe("workspace isolation (Epic #16)", () => {
  it("summary and update/delete never cross workspaces", async () => {
    await record(WS_A, "revenue", "Sales", 10000, "2026-03-05T00:00:00.000Z");
    await record(WS_A, "expense", "SaaS", 3000, "2026-03-06T00:00:00.000Z");
    const inB = await record(WS_B, "revenue", "Sales", 999, "2026-03-05T00:00:00.000Z");
    const idB = inB.data.createLedgerEvent.id;

    const sumA = await gql(
      `query{ ledgerSummary{ revenueCents expenseCents netCents } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(sumA.data.ledgerSummary).toEqual({
      revenueCents: 10000,
      expenseCents: 3000,
      netCents: 7000,
    });

    // Admin in A cannot update/delete B's event.
    const upd = await gql(
      `mutation($id:String!){ updateLedgerEvent(id:$id, amountCents:1){ id } }`,
      { id: idB },
      await cookieFor(WS_A, "admin"),
    );
    expect(upd.errors).toBeDefined();
    const del = await gql(
      `mutation($id:String!){ deleteLedgerEvent(id:$id) }`,
      { id: idB },
      await cookieFor(WS_A, "admin"),
    );
    // deleteMany scoped → returns false (nothing deleted in A's scope), B row intact.
    expect(del.data?.deleteLedgerEvent === false || del.errors).toBeTruthy();
    const stillThere = await prisma.ledgerEvent.findUnique({ where: { id: idB } });
    expect(stillThere).not.toBeNull();
  });
});

describe("feature gate (Epic #16)", () => {
  it("rejects when LEDGER is off", async () => {
    const admin = await cookieFor(WS_A, "admin");
    try {
      setTestFeature("ledger", false);
      invalidateFlagCache();
      const r = await gql(`query{ ledgerSummary{ netCents } }`, undefined, admin);
      expect(r.errors).toBeDefined();
      expect(r.data?.ledgerSummary).toBeFalsy();
    } finally {
      resetTestFeature("ledger");
      invalidateFlagCache();
    }
  });
});
