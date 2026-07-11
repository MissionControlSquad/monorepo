import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { installTeam } from "../../src/server/services/teams";
import { createTeam, addTeamMember } from "../../src/server/services/teams";
import { createTestAgent } from "../helpers";

/**
 * Epic #10 skills + teams — real GraphQL route + Postgres. `userId` is a real Profile id (skill FK).
 */
const SECRET = "skills-test-secret";
const WS_A = "ws_skills_A";
const WS_B = "ws_skills_B";
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
async function makeSkill(ws: string, name = "Deploy Runbook", markdown = "# do it") {
  return gql(
    `mutation($n:String!,$m:String!){ createSkill(name:$n, markdown:$m){ id key currentVersion } }`,
    { n: name, m: markdown },
    await cookieFor(ws, "member"),
  );
}
async function agentInWs(ws: string, name: string) {
  const { agent } = await createTestAgent({ name });
  await prisma.agent.update({ where: { id: agent.id }, data: { workspaceId: ws } });
  return agent.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE skills, teams, agents, profiles CASCADE`);
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Skills Human" } });
  humanId = p.id;
});

describe("skills library (Epic #10)", () => {
  it("create snapshots rev 1; a markdown change adds rev 2 + bumps currentVersion", async () => {
    const r = await makeSkill(WS_A);
    const id = r.data.createSkill.id;
    expect(r.data.createSkill.currentVersion).toBe(1);
    const member = await cookieFor(WS_A, "member");

    // No markdown change → still 1 version.
    await gql(
      `mutation($id:String!){ updateSkill(id:$id, description:"d"){ currentVersion } }`,
      { id },
      member,
    );
    expect(await prisma.skillVersion.count({ where: { skillId: id } })).toBe(1);

    // Markdown change → rev 2.
    const up = await gql(
      `mutation($id:String!,$m:String!){ updateSkill(id:$id, markdown:$m){ currentVersion } }`,
      { id, m: "# changed" },
      member,
    );
    expect(up.data.updateSkill.currentVersion).toBe(2);
    expect(await prisma.skillVersion.count({ where: { skillId: id } })).toBe(2);
  });

  it("fork clones the skill + sets forkedFromSkillId + bumps source forkCount", async () => {
    const id = (await makeSkill(WS_A)).data.createSkill.id;
    const fork = await gql(
      `mutation($id:String!){ forkSkill(id:$id){ id forkedFromSkillId } }`,
      { id },
      await cookieFor(WS_A, "member"),
    );
    expect(fork.data.forkSkill.forkedFromSkillId).toBe(id);
    const src = await prisma.skill.findUniqueOrThrow({ where: { id } });
    expect(src.forkCount).toBe(1);
  });

  it("star is idempotent and unstar decrements", async () => {
    const id = (await makeSkill(WS_A)).data.createSkill.id;
    const member = await cookieFor(WS_A, "member");
    const s1 = await gql(`mutation($id:String!){ starSkill(id:$id) }`, { id }, member);
    expect(s1.data.starSkill).toBe(1);
    const s2 = await gql(`mutation($id:String!){ starSkill(id:$id) }`, { id }, member);
    expect(s2.data.starSkill).toBe(1); // idempotent
    const u = await gql(`mutation($id:String!){ unstarSkill(id:$id) }`, { id }, member);
    expect(u.data.unstarSkill).toBe(0);
  });

  it("assign to an agent sets installCount; duplicate rejected; unassign clears it", async () => {
    const id = (await makeSkill(WS_A)).data.createSkill.id;
    const agentId = await agentInWs(WS_A, "Worker");
    const member = await cookieFor(WS_A, "member");
    const a = await gql(
      `mutation($ag:String!,$sk:String!){ assignSkill(agentId:$ag, skillId:$sk){ id } }`,
      { ag: agentId, sk: id },
      member,
    );
    expect(a.errors).toBeFalsy();
    expect((await prisma.skill.findUniqueOrThrow({ where: { id } })).installCount).toBe(1);
    const dup = await gql(
      `mutation($ag:String!,$sk:String!){ assignSkill(agentId:$ag, skillId:$sk){ id } }`,
      { ag: agentId, sk: id },
      member,
    );
    expect(dup.errors).toBeDefined();
    await gql(
      `mutation($ag:String!,$sk:String!){ unassignSkill(agentId:$ag, skillId:$sk) }`,
      { ag: agentId, sk: id },
      member,
    );
    expect((await prisma.skill.findUniqueOrThrow({ where: { id } })).installCount).toBe(0);
  });
});

describe("teams install collision strategies (Epic #10)", () => {
  async function teamWithMember(memberName: string) {
    const team = await createTeam({
      workspaceId: WS_A,
      name: "Growth",
      createdByProfileId: humanId,
    });
    await addTeamMember(WS_A, team.id, { name: memberName, role: "Marketer" });
    return team.id;
  }

  it("rename creates a de-duplicated agent when the name collides", async () => {
    await agentInWs(WS_A, "Alice");
    const teamId = await teamWithMember("Alice");
    const res = await installTeam({ workspaceId: WS_A, teamId, collisionStrategy: "rename" });
    expect(res.createdAgentIds).toHaveLength(1);
    const created = await prisma.agent.findUniqueOrThrow({ where: { id: res.createdAgentIds[0] } });
    expect(created.name).toBe("Alice-2");
  });

  it("skip leaves the existing agent and creates nothing", async () => {
    await agentInWs(WS_A, "Bob");
    const teamId = await teamWithMember("Bob");
    const res = await installTeam({ workspaceId: WS_A, teamId, collisionStrategy: "skip" });
    expect(res.createdAgentIds).toHaveLength(0);
    expect(
      await prisma.agent.count({ where: { workspaceId: WS_A, name: { startsWith: "Bob" } } }),
    ).toBe(1);
  });

  it("replace overwrites the existing agent's role", async () => {
    const existingId = await agentInWs(WS_A, "Carol");
    const teamId = await teamWithMember("Carol");
    const res = await installTeam({ workspaceId: WS_A, teamId, collisionStrategy: "replace" });
    expect(res.createdAgentIds).toContain(existingId);
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: existingId } })).role).toBe(
      "Marketer",
    );
  });

  it("installTeam via GraphQL (admin) records the install", async () => {
    const teamId = await teamWithMember("Dave");
    const r = await gql(
      `mutation($t:String!){ installTeam(teamId:$t, collisionStrategy:"rename"){ id createdAgentIds } }`,
      { t: teamId },
      await cookieFor(WS_A, "admin"),
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.installTeam.createdAgentIds).toHaveLength(1);
    // member cannot install.
    const denied = await gql(
      `mutation($t:String!){ installTeam(teamId:$t){ id } }`,
      { t: teamId },
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();
  });
});

describe("isolation + gate (Epic #10)", () => {
  it("a workspace cannot see another's skills", async () => {
    await makeSkill(WS_B);
    const list = await gql(`query{ skills{ id } }`, undefined, await cookieFor(WS_A, "member"));
    expect(list.data.skills).toHaveLength(0);
  });
  it("rejects access when SKILLS_TEAMS is off", async () => {
    try {
      await prisma.featureFlag.upsert({
        where: { key: "skills_teams" },
        create: { key: "skills_teams", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const r = await gql(`query{ skills{ id } }`, undefined, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "skills_teams" } });
      invalidateFlagCache();
    }
  });
});
