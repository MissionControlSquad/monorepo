import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { createTestAgent } from "../helpers";

/**
 * Epic #11 goals — real GraphQL route + Postgres. Hierarchical, agent-owned, workspace-scoped.
 */
const SECRET = "goals-test-secret";
const WS_A = "ws_goals_A";
const WS_B = "ws_goals_B";
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
async function agentInWs(ws: string, name: string) {
  const { agent } = await createTestAgent({ name });
  await prisma.agent.update({ where: { id: agent.id }, data: { workspaceId: ws } });
  return agent.id;
}
const CREATE = `mutation($t:String!,$l:String,$s:String,$p:String,$o:String){ createGoal(title:$t, level:$l, status:$s, parentId:$p, ownerAgentId:$o){ id title level status parentId ownerAgentId } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE goals, agents, profiles CASCADE`);
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Goals Human" } });
  humanId = p.id;
});

describe("goals CRUD + hierarchy (Epic #11)", () => {
  it("creates a goal with defaults (level task, status planned)", async () => {
    const r = await gql(CREATE, { t: "Ship v1" }, await cookieFor(WS_A, "member"));
    expect(r.errors).toBeFalsy();
    expect(r.data.createGoal).toMatchObject({ title: "Ship v1", level: "task", status: "planned" });
  });

  it("creates a child under a parent; list returns both; child exposes parentId", async () => {
    const member = await cookieFor(WS_A, "member");
    const parent = (await gql(CREATE, { t: "Company OKR", l: "company" }, member)).data.createGoal;
    const child = (await gql(CREATE, { t: "Team OKR", l: "team", p: parent.id }, member)).data
      .createGoal;
    expect(child.parentId).toBe(parent.id);
    const list = await gql(`query{ goals{ id title children{ id } } }`, undefined, member);
    expect(list.data.goals).toHaveLength(2);
    const parentRow = list.data.goals.find((g: any) => g.id === parent.id);
    expect(parentRow.children).toHaveLength(1);
  });

  it("assigns + clears an owner agent", async () => {
    const member = await cookieFor(WS_A, "member");
    const agentId = await agentInWs(WS_A, "Owner");
    const g = (await gql(CREATE, { t: "Owned", o: agentId }, member)).data.createGoal;
    expect(g.ownerAgentId).toBe(agentId);
    const cleared = await gql(
      `mutation($id:String!){ updateGoal(id:$id, clearOwner:true){ id ownerAgentId } }`,
      { id: g.id },
      member,
    );
    expect(cleared.data.updateGoal.ownerAgentId).toBeNull();
  });

  it("deletes a parent and re-roots its child (SetNull, no cascade)", async () => {
    const member = await cookieFor(WS_A, "member");
    const parent = (await gql(CREATE, { t: "P", l: "company" }, member)).data.createGoal;
    const child = (await gql(CREATE, { t: "C", p: parent.id }, member)).data.createGoal;
    await gql(`mutation($id:String!){ deleteGoal(id:$id) }`, { id: parent.id }, member);
    const stillThere = await prisma.goal.findUnique({ where: { id: child.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.parentId).toBeNull();
  });
});

describe("guards (Epic #11)", () => {
  it("rejects a parent from another workspace", async () => {
    const foreign = (await gql(CREATE, { t: "Foreign" }, await cookieFor(WS_B, "member"))).data
      .createGoal;
    const denied = await gql(CREATE, { t: "X", p: foreign.id }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined();
  });

  it("rejects a re-parent that would create a cycle", async () => {
    const member = await cookieFor(WS_A, "member");
    const a = (await gql(CREATE, { t: "A", l: "company" }, member)).data.createGoal;
    const b = (await gql(CREATE, { t: "B", p: a.id }, member)).data.createGoal;
    // Try to move A under B (its own descendant).
    const bad = await gql(
      `mutation($id:String!,$p:String!){ updateGoal(id:$id, parentId:$p){ id } }`,
      { id: a.id, p: b.id },
      member,
    );
    expect(bad.errors).toBeDefined();
  });

  it("rejects an invalid level", async () => {
    const bad = await gql(CREATE, { t: "X", l: "galaxy" }, await cookieFor(WS_A, "member"));
    expect(bad.errors).toBeDefined();
  });
});

describe("default goal resolution (Epic #11)", () => {
  it("prefers the oldest active root company goal", async () => {
    const member = await cookieFor(WS_A, "member");
    // A planned root, then an active root — active should win regardless of order.
    await gql(CREATE, { t: "Planned root", l: "company", s: "planned" }, member);
    const active = (await gql(CREATE, { t: "Active root", l: "company", s: "active" }, member)).data
      .createGoal;
    const r = await gql(`query{ defaultGoal{ id title } }`, undefined, member);
    expect(r.data.defaultGoal.id).toBe(active.id);
  });

  it("falls back to any root company goal when none active", async () => {
    const member = await cookieFor(WS_A, "member");
    const root = (await gql(CREATE, { t: "Only root", l: "company", s: "planned" }, member)).data
      .createGoal;
    const r = await gql(`query{ defaultGoal{ id } }`, undefined, member);
    expect(r.data.defaultGoal.id).toBe(root.id);
  });

  it("returns null when there is no company goal", async () => {
    const member = await cookieFor(WS_A, "member");
    await gql(CREATE, { t: "Just a task", l: "task" }, member);
    const r = await gql(`query{ defaultGoal{ id } }`, undefined, member);
    expect(r.data.defaultGoal).toBeNull();
  });
});

describe("isolation + gate (Epic #11)", () => {
  it("a workspace cannot see another's goals", async () => {
    await gql(CREATE, { t: "B goal" }, await cookieFor(WS_B, "member"));
    const list = await gql(`query{ goals{ id } }`, undefined, await cookieFor(WS_A, "member"));
    expect(list.data.goals).toHaveLength(0);
  });

  it("rejects access when GOALS is off", async () => {
    try {
      await prisma.featureFlag.upsert({
        where: { key: "goals" },
        create: { key: "goals", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const r = await gql(`query{ goals{ id } }`, undefined, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "goals" } });
      invalidateFlagCache();
    }
  });
});
