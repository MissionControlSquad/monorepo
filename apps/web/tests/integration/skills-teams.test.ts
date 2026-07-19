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
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE skills, skill_policies, teams, agents, profiles, agent_governance_policies CASCADE`,
  );
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

describe("skill bundle files (Epic #10)", () => {
  const UPSERT = `mutation($s:String!,$p:String!,$c:String!){ upsertSkillFile(skillId:$s, path:$p, content:$c){ id path content } }`;

  it("upsert creates then updates by path; list is sorted; delete removes", async () => {
    const skillId = (await makeSkill(WS_A)).data.createSkill.id;
    const member = await cookieFor(WS_A, "member");

    // create two files
    await gql(UPSERT, { s: skillId, p: "scripts/run.py", c: "print(1)" }, member);
    const first = await gql(UPSERT, { s: skillId, p: "SKILL.md", c: "# entry" }, member);
    expect(first.errors).toBeFalsy();

    // upsert same path updates content (no duplicate row)
    await gql(UPSERT, { s: skillId, p: "scripts/run.py", c: "print(2)" }, member);
    expect(await prisma.skillFile.count({ where: { skillId } })).toBe(2);

    // list reflects both files and the update
    const list = await gql(
      `query($s:String!){ skillFiles(skillId:$s){ path content } }`,
      { s: skillId },
      member,
    );
    const byPath = Object.fromEntries(
      list.data.skillFiles.map((f: { path: string; content: string }) => [f.path, f.content]),
    );
    expect(Object.keys(byPath).sort()).toEqual(["SKILL.md", "scripts/run.py"]);
    expect(byPath["scripts/run.py"]).toBe("print(2)");

    // delete
    const del = await gql(
      `mutation($s:String!,$p:String!){ deleteSkillFile(skillId:$s, path:$p) }`,
      { s: skillId, p: "SKILL.md" },
      member,
    );
    expect(del.data.deleteSkillFile).toBe(true);
    expect(await prisma.skillFile.count({ where: { skillId } })).toBe(1);
  });

  it("classifies file kind on upsert and parses SKILL.md frontmatter on create (GAP-A)", async () => {
    const member = await cookieFor(WS_A, "member");
    // create a skill whose markdown carries frontmatter
    const created = await gql(
      `mutation($n:String!,$m:String!){ createSkill(name:$n, markdown:$m){ id frontmatter } }`,
      {
        n: "Fronted",
        m: "---\nname: Fronted\ndescription: has fm\ntags: [a, b]\n---\n# Fronted",
      },
      member,
    );
    expect(created.data.createSkill.frontmatter).toMatchObject({
      name: "Fronted",
      description: "has fm",
      tags: ["a", "b"],
    });
    const skillId = created.data.createSkill.id;

    await gql(UPSERT, { s: skillId, p: "scripts/run.py", c: "print(1)" }, member);
    await gql(UPSERT, { s: skillId, p: "references/api.md", c: "# api" }, member);
    await gql(UPSERT, { s: skillId, p: "assets/logo.png", c: "binary" }, member);

    const kinds = Object.fromEntries(
      (await prisma.skillFile.findMany({ where: { skillId } })).map((f) => [f.path, f.kind]),
    );
    expect(kinds["scripts/run.py"]).toBe("script");
    expect(kinds["references/api.md"]).toBe("reference");
    expect(kinds["assets/logo.png"]).toBe("asset");
  });

  it("lintSkill validates the skill + its files (test-run, no execution)", async () => {
    // A skill with an empty entry doc would be rejected at create, so create a valid one then
    // add an empty file to trigger a warn.
    const skillId = (await makeSkill(WS_A, "Lintable", "# Title\ncontent")).data.createSkill.id;
    const member = await cookieFor(WS_A, "member");
    await gql(UPSERT, { s: skillId, p: "empty.txt", c: "" }, member);

    const r = await gql(
      `query($s:String!){ lintSkill(skillId:$s){ level path message } }`,
      { s: skillId },
      member,
    );
    expect(r.errors).toBeFalsy();
    const findings = r.data.lintSkill as { level: string; path: string | null; message: string }[];
    expect(findings).toContainEqual({
      level: "warn",
      path: "empty.txt",
      message: "file is empty",
    });
  });

  it("rejects a path-traversal path and isolates across workspaces", async () => {
    const skillId = (await makeSkill(WS_A)).data.createSkill.id;
    const bad = await gql(
      UPSERT,
      { s: skillId, p: "../etc/passwd", c: "x" },
      await cookieFor(WS_A, "member"),
    );
    expect(bad.errors).toBeDefined();

    // WS_B cannot add a file to WS_A's skill (scoped → skill not found).
    const cross = await gql(
      UPSERT,
      { s: skillId, p: "a.md", c: "x" },
      await cookieFor(WS_B, "member"),
    );
    expect(cross.errors).toBeDefined();
  });
});

describe("public skill catalog (Epic #10)", () => {
  // publish a skill in WS_B, install it into WS_A.
  async function publishInB(name = "Shared Runbook") {
    const created = await gql(
      `mutation($n:String!,$m:String!){ createSkill(name:$n, markdown:$m){ id } }`,
      { n: name, m: "# shared" },
      await cookieFor(WS_B, "member"),
    );
    const id = created.data.createSkill.id;
    await gql(
      `mutation($id:String!,$s:String!){ updateSkill(id:$id, sharingScope:$s){ id sharingScope } }`,
      { id, s: "public" },
      await cookieFor(WS_B, "member"),
    );
    // add a bundle file so we can prove install copies files too
    await gql(
      `mutation($s:String!,$p:String!,$c:String!){ upsertSkillFile(skillId:$s, path:$p, content:$c){ id } }`,
      { s: id, p: "run.sh", c: "echo hi" },
      await cookieFor(WS_B, "member"),
    );
    return id;
  }

  it("catalog lists other workspaces' PUBLIC skills only; private/workspace never leak", async () => {
    const publicId = await publishInB();
    // a NON-public skill in WS_B must never appear
    await gql(
      `mutation($n:String!,$m:String!){ createSkill(name:$n, markdown:$m){ id } }`,
      { n: "Secret WS_B", m: "# private" },
      await cookieFor(WS_B, "member"),
    );

    const cat = await gql(
      `query{ skillCatalog{ id name } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    const ids = (cat.data.skillCatalog as { id: string }[]).map((s) => s.id);
    expect(ids).toContain(publicId);
    expect(cat.data.skillCatalog).toHaveLength(1); // only the public one

    // WS_B does not see its OWN skill in its catalog (catalog excludes own workspace)
    const ownCat = await gql(
      `query{ skillCatalog{ id } }`,
      undefined,
      await cookieFor(WS_B, "member"),
    );
    expect(ownCat.data.skillCatalog).toHaveLength(0);
  });

  it("install copies the skill + its files into the caller's workspace and bumps source forkCount", async () => {
    const publicId = await publishInB();
    const inst = await gql(
      `mutation($id:String!){ installCatalogSkill(skillId:$id){ id name workspaceId sharingScope forkedFromSkillId } }`,
      { id: publicId },
      await cookieFor(WS_A, "member"),
    );
    expect(inst.errors).toBeFalsy();
    const copy = inst.data.installCatalogSkill;
    expect(copy.workspaceId).toBe(WS_A);
    expect(copy.sharingScope).toBe("workspace"); // the copy is private by default
    expect(copy.forkedFromSkillId).toBe(publicId);
    // files were copied
    expect(await prisma.skillFile.count({ where: { skillId: copy.id, path: "run.sh" } })).toBe(1);
    // source forkCount bumped
    expect((await prisma.skill.findUniqueOrThrow({ where: { id: publicId } })).forkCount).toBe(1);
  });

  it("a non-public skill id cannot be installed", async () => {
    const priv = await gql(
      `mutation($n:String!,$m:String!){ createSkill(name:$n, markdown:$m){ id } }`,
      { n: "NotShared", m: "# x" },
      await cookieFor(WS_B, "member"),
    );
    const r = await gql(
      `mutation($id:String!){ installCatalogSkill(skillId:$id){ id } }`,
      { id: priv.data.createSkill.id },
      await cookieFor(WS_A, "member"),
    );
    expect(r.errors).toBeDefined();
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

  it("previewTeamInstall (admin) is a dry-run: reports the plan without creating agents", async () => {
    await agentInWs(WS_A, "Eve");
    const teamId = await teamWithMember("Eve");
    const before = await prisma.agent.count({ where: { workspaceId: WS_A, name: "Eve" } });
    const r = await gql(
      `query($t:String!){ previewTeamInstall(teamId:$t, collisionStrategy:"rename"){ member action agentName } }`,
      { t: teamId },
      await cookieFor(WS_A, "admin"),
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.previewTeamInstall).toEqual([
      { member: "Eve", action: "create", agentName: "Eve-2" },
    ]);
    // dry-run: no new agent was created.
    expect(
      await prisma.agent.count({ where: { workspaceId: WS_A, name: { startsWith: "Eve" } } }),
    ).toBe(before);
    // member cannot preview an install.
    const denied = await gql(
      `query($t:String!){ previewTeamInstall(teamId:$t){ member } }`,
      { t: teamId },
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();
  });
});

describe("agent governance (Epic A.4)", () => {
  it("requireAgentApproval provisions installed agents as pending_setup (blocked from work)", async () => {
    const admin = await cookieFor(WS_A, "admin");
    // Turn on the governance knob.
    const set = await gql(
      `mutation($r:Boolean){ setAgentGovernance(requireAgentApproval:$r){ requireAgentApproval } }`,
      { r: true },
      admin,
    );
    expect(set.data.setAgentGovernance.requireAgentApproval).toBe(true);
    // A member cannot change governance.
    const denied = await gql(
      `mutation($r:Boolean){ setAgentGovernance(requireAgentApproval:$r){ requireAgentApproval } }`,
      { r: false },
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();

    // Install a team → its new agent must be pending_setup.
    const team = await createTeam({ workspaceId: WS_A, name: "Gov", createdByProfileId: humanId });
    await addTeamMember(WS_A, team.id, { name: "Newbie", role: "Worker" });
    const res = await installTeam({
      workspaceId: WS_A,
      teamId: team.id,
      collisionStrategy: "rename",
    });
    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: res.createdAgentIds[0] } });
    expect(agent.setupStatus).toBe("pending_setup");

    // With governance OFF, a freshly installed agent is active.
    await gql(
      `mutation{ setAgentGovernance(requireAgentApproval:false){ requireAgentApproval } }`,
      undefined,
      admin,
    );
    const team2 = await createTeam({
      workspaceId: WS_A,
      name: "Gov2",
      createdByProfileId: humanId,
    });
    await addTeamMember(WS_A, team2.id, { name: "Active", role: "Worker" });
    const res2 = await installTeam({
      workspaceId: WS_A,
      teamId: team2.id,
      collisionStrategy: "rename",
    });
    const agent2 = await prisma.agent.findUniqueOrThrow({ where: { id: res2.createdAgentIds[0] } });
    expect(agent2.setupStatus).toBe("active");
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

describe("skill appearance + delete (Epic #10)", () => {
  it("stores appearance metadata on create and deletes a skill", async () => {
    const member = await cookieFor(WS_A, "member");
    const created = await gql(
      `mutation{ createSkill(name:"Deploy", markdown:"# md", icon:"🚀", tagline:"ship it", author:"acme"){ id icon tagline author } }`,
      undefined,
      member,
    );
    expect(created.errors).toBeFalsy();
    expect(created.data.createSkill).toMatchObject({
      icon: "🚀",
      tagline: "ship it",
      author: "acme",
    });
    const id = created.data.createSkill.id;

    const del = await gql(`mutation($id:String!){ deleteSkill(id:$id) }`, { id }, member);
    expect(del.data.deleteSkill).toBe(true);
    expect(await prisma.skill.count({ where: { id } })).toBe(0);
  });

  it("cannot delete another workspace's skill", async () => {
    const inB = await gql(
      `mutation{ createSkill(name:"B skill", markdown:"# x"){ id } }`,
      undefined,
      await cookieFor(WS_B, "member"),
    );
    const idB = inB.data.createSkill.id;
    const cross = await gql(
      `mutation($id:String!){ deleteSkill(id:$id) }`,
      { id: idB },
      await cookieFor(WS_A, "member"),
    );
    expect(cross.errors).toBeDefined();
    expect(await prisma.skill.count({ where: { id: idB } })).toBe(1);
  });
});

describe("team catalog metadata (Epic #10)", () => {
  it("stores appearance + tags on create and exposes them", async () => {
    const member = await cookieFor(WS_A, "member");
    const r = await gql(
      `mutation{ createTeam(name:"Growth Pod", icon:"📈", tagline:"scale it", author:"acme", tags:["growth","sales"]){ id icon tagline author tags } }`,
      undefined,
      member,
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.createTeam).toMatchObject({
      icon: "📈",
      tagline: "scale it",
      author: "acme",
    });
    expect(r.data.createTeam.tags).toEqual(["growth", "sales"]);

    const list = await gql(`query{ teams{ id tags tagline } }`, undefined, member);
    const found = (list.data.teams as { id: string; tags: string[] }[]).find(
      (t) => t.id === r.data.createTeam.id,
    );
    expect(found?.tags).toContain("growth");
  });
});

describe("skill governance policy (Domain 5 GAP-F)", () => {
  const REPLACE = `mutation($d:String!,$r:JSON!,$rev:Int){ replaceSkillPolicy(defaultEffect:$d, rules:$r, expectedRevision:$rev) }`;

  it("default policy allows; a deny rule blocks the matching action for the matching role", async () => {
    const admin = await cookieFor(WS_A, "admin");
    // baseline: no policy → create allowed
    expect((await makeSkill(WS_A, "Before Policy")).errors).toBeFalsy();

    // admin writes a policy denying create for role member
    const set = await gql(
      REPLACE,
      {
        d: "allow",
        r: [
          {
            id: "no-member-create",
            effect: "deny",
            actions: ["create"],
            subjects: [{ type: "roles", roles: ["member"] }],
            remediation: "ask an admin",
          },
        ],
      },
      admin,
    );
    expect(set.errors).toBeFalsy();
    expect(set.data.replaceSkillPolicy).toMatchObject({ revision: 1, defaultEffect: "allow" });

    // a member create is now denied
    const denied = await gql(
      `mutation{ createSkill(name:"Blocked", markdown:"# x"){ id } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();
    expect(denied.data?.createSkill).toBeFalsy();

    // an admin create is still allowed (role not in the subject)
    const adminCreate = await gql(
      `mutation{ createSkill(name:"Admin Skill", markdown:"# ok"){ id } }`,
      undefined,
      admin,
    );
    expect(adminCreate.errors).toBeFalsy();
  });

  it("replaceSkillPolicy is admin-only and enforces optimistic concurrency", async () => {
    const member = await cookieFor(WS_A, "member");
    const denied = await gql(REPLACE, { d: "deny", r: [] }, member);
    expect(denied.errors).toBeDefined();

    const admin = await cookieFor(WS_A, "admin");
    await gql(REPLACE, { d: "allow", r: [] }, admin); // revision → 1
    // a stale expectedRevision (0) conflicts
    const conflict = await gql(REPLACE, { d: "deny", r: [], rev: 0 }, admin);
    expect(conflict.errors).toBeDefined();
    // the correct revision succeeds
    const ok = await gql(REPLACE, { d: "deny", r: [], rev: 1 }, admin);
    expect(ok.data.replaceSkillPolicy.revision).toBe(2);
  });

  it("evaluateSkillPolicy explains a decision without enforcing", async () => {
    const admin = await cookieFor(WS_A, "admin");
    await gql(
      REPLACE,
      { d: "allow", r: [{ id: "deny-remove", effect: "deny", actions: ["remove"] }] },
      admin,
    );
    const decision = await gql(
      `query{ evaluateSkillPolicy(action:"remove"){ allowed effect matchedRuleId } }`,
      undefined,
      admin,
    );
    expect(decision.data.evaluateSkillPolicy).toMatchObject({
      allowed: false,
      effect: "deny",
      matchedRuleId: "deny-remove",
    });
  });
});
