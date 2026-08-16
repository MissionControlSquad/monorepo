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
 * Epic #19 org chart — real GraphQL route + Postgres. Agent reporting hierarchy, workspace-scoped.
 */
const SECRET = "org-test-secret";
const WS_A = "ws_org_A";
const WS_B = "ws_org_B";
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
async function makeAgent(ws: string, name: string) {
  const a = await prisma.agent.create({ data: { name, role: "worker", workspaceId: ws } });
  return a.id;
}
const SET = `mutation($a:String!,$m:String){ setAgentReportsTo(agentId:$a, reportsToAgentId:$m){ id reportsToAgentId } }`;
const HEALTH = `query($a:String!){ agentOrgChainHealth(agentId:$a){ status reason invalidAncestorId } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE agents, profiles CASCADE`);
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Org Human" } });
  humanId = p.id;
});

describe("reporting hierarchy (Epic #19)", () => {
  it("sets and clears a manager", async () => {
    const member = await cookieFor(WS_A, "member");
    const ceo = await makeAgent(WS_A, "CEO");
    const eng = await makeAgent(WS_A, "Eng");
    const set = await gql(SET, { a: eng, m: ceo }, member);
    expect(set.data.setAgentReportsTo.reportsToAgentId).toBe(ceo);
    const cleared = await gql(SET, { a: eng, m: null }, member);
    expect(cleared.data.setAgentReportsTo.reportsToAgentId).toBeNull();
  });

  it("orgChart returns the workspace agents with the manager edge", async () => {
    const member = await cookieFor(WS_A, "member");
    const ceo = await makeAgent(WS_A, "CEO");
    const eng = await makeAgent(WS_A, "Eng");
    await gql(SET, { a: eng, m: ceo }, member);
    const r = await gql(`query{ orgChart{ id name reportsToAgentId } }`, undefined, member);
    expect(r.data.orgChart).toHaveLength(2);
    const engRow = r.data.orgChart.find((a: any) => a.id === eng);
    expect(engRow.reportsToAgentId).toBe(ceo);
  });

  it("rejects a cycle and a cross-workspace manager", async () => {
    const member = await cookieFor(WS_A, "member");
    const a1 = await makeAgent(WS_A, "A1");
    const a2 = await makeAgent(WS_A, "A2");
    await gql(SET, { a: a2, m: a1 }, member); // a2 → a1
    // now try a1 → a2 (cycle)
    const cyc = await gql(SET, { a: a1, m: a2 }, member);
    expect(cyc.errors).toBeDefined();
    // cross-workspace manager
    const foreign = await makeAgent(WS_B, "Foreign");
    const cross = await gql(SET, { a: a1, m: foreign }, member);
    expect(cross.errors).toBeDefined();
  });
});

describe("org-chain health (Epic #19)", () => {
  it("reports healthy, cycle, and missing_manager", async () => {
    const member = await cookieFor(WS_A, "member");
    const ceo = await makeAgent(WS_A, "CEO");
    const eng = await makeAgent(WS_A, "Eng");
    await gql(SET, { a: eng, m: ceo }, member);
    expect((await gql(HEALTH, { a: eng }, member)).data.agentOrgChainHealth.status).toBe("healthy");

    // Force a cycle directly in the DB (bypassing the write guard) to prove detection.
    await prisma.agent.update({ where: { id: ceo }, data: { reportsToAgentId: eng } });
    const cyc = await gql(HEALTH, { a: eng }, member);
    expect(cyc.data.agentOrgChainHealth.reason).toBe("cycle");

    // Missing manager: the manager exists but is outside the queried workspace, so the workspace-
    // scoped health view can't see it. (The FK forbids a truly dangling id; SetNull prevents orphans.)
    await prisma.agent.update({ where: { id: ceo }, data: { reportsToAgentId: null } });
    const foreignManager = await makeAgent(WS_B, "Foreign Manager");
    await prisma.agent.update({ where: { id: eng }, data: { reportsToAgentId: foreignManager } });
    const miss = await gql(HEALTH, { a: eng }, member);
    expect(miss.data.agentOrgChainHealth.reason).toBe("missing_manager");
    expect(miss.data.agentOrgChainHealth.invalidAncestorId).toBe(foreignManager);
  });
});

describe("isolation + gate (Epic #19)", () => {
  it("a workspace cannot see another's org chart", async () => {
    await makeAgent(WS_B, "B-only");
    const r = await gql(`query{ orgChart{ id } }`, undefined, await cookieFor(WS_A, "member"));
    expect(r.data.orgChart).toHaveLength(0);
  });

  it("rejects access when ORG_CHART is off", async () => {
    try {
      setTestFeature("org_chart", false);
      invalidateFlagCache();
      const r = await gql(`query{ orgChart{ id } }`, undefined, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature("org_chart");
      invalidateFlagCache();
    }
  });
});
