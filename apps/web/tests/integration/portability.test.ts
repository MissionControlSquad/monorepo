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
import { createSkill } from "../../src/server/services/skills";

/**
 * Epic #14 workspace export/import — real GraphQL route + Postgres. Export is member (read); import is
 * admin (provisions entities). A bundle must never carry secrets. `userId` is a real Profile id.
 */
const SECRET = "portability-test-secret";
const WS_A = "ws_port_A";
const WS_B = "ws_port_B";
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

/** Seed a small workspace: 1 agent (with a secret hash), 1 project, 1 skill. */
async function seed(ws: string) {
  await prisma.agent.create({
    data: {
      name: "Ada",
      role: "engineer",
      workspaceId: ws,
      personality: "precise",
      llmModel: "claude-opus-4-8",
      apiKeyHash: `secret-hash-${ws}`,
      apiKeyPrefix: "sk_live",
    },
  });
  await prisma.project.create({ data: { name: "Apollo", description: "moon", workspaceId: ws } });
  await createSkill({ workspaceId: ws, key: "triage", name: "Triage", markdown: "# Triage" });
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE workspace_imports, skills, agents, projects, profiles CASCADE`,
  );
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Port Human" } });
  humanId = p.id;
});

describe("export (Epic #14)", () => {
  it("returns the caller's agents/projects/skills — and NO secrets", async () => {
    await seed(WS_A);
    const r = await gql(
      `query{ exportWorkspaceBundle }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(r.errors).toBeFalsy();
    const b = r.data.exportWorkspaceBundle;
    expect(b.version).toBe(1);
    expect(b.agents).toHaveLength(1);
    expect(b.projects).toHaveLength(1);
    expect(b.skills).toHaveLength(1);
    // The agent carries safe config only — never a key/hash/id/workspace.
    const agent = b.agents[0];
    expect(agent.name).toBe("Ada");
    expect(agent.llmModel).toBe("claude-opus-4-8");
    const blob = JSON.stringify(b);
    for (const forbidden of [
      "apiKeyHash",
      "apiKeyPrefix",
      "secret-hash",
      "sk_live",
      "workspaceId",
    ]) {
      expect(blob).not.toContain(forbidden);
    }
  });

  it("is workspace-isolated — WS_A export omits WS_B data", async () => {
    await seed(WS_B);
    const r = await gql(
      `query{ exportWorkspaceBundle }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(r.data.exportWorkspaceBundle.agents).toHaveLength(0);
    expect(r.data.exportWorkspaceBundle.projects).toHaveLength(0);
  });
});

describe("import (Epic #14)", () => {
  const IMPORT = `mutation($b:JSON!,$s:String){ importWorkspaceBundle(bundle:$b, collisionStrategy:$s){ id summary createdAgentIds } }`;

  it("round-trips: export WS_A → import into WS_B reproduces the entities", async () => {
    await seed(WS_A);
    const exp = await gql(
      `query{ exportWorkspaceBundle }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    const bundle = exp.data.exportWorkspaceBundle;
    const imp = await gql(IMPORT, { b: bundle, s: "rename" }, await cookieFor(WS_B, "admin"));
    expect(imp.errors).toBeFalsy();
    expect(imp.data.importWorkspaceBundle.summary).toMatchObject({
      createdAgents: 1,
      createdProjects: 1,
      createdSkills: 1,
    });
    expect(await prisma.agent.count({ where: { workspaceId: WS_B, name: "Ada" } })).toBe(1);
    expect(await prisma.project.count({ where: { workspaceId: WS_B, name: "Apollo" } })).toBe(1);
    expect(await prisma.skill.count({ where: { workspaceId: WS_B, key: "triage" } })).toBe(1);
  });

  it("applies the collision strategy: rename de-dupes a same-named agent, skips same-key skill / same-name project", async () => {
    await seed(WS_B); // pre-existing Ada / Apollo / triage in WS_B
    await seed(WS_A);
    const bundle = (
      await gql(`query{ exportWorkspaceBundle }`, undefined, await cookieFor(WS_A, "member"))
    ).data.exportWorkspaceBundle;
    const imp = await gql(IMPORT, { b: bundle, s: "rename" }, await cookieFor(WS_B, "admin"));
    expect(imp.data.importWorkspaceBundle.summary).toMatchObject({
      createdAgents: 1,
      skippedProjects: 1,
      skippedSkills: 1,
    });
    // Agent renamed on collision; project/skill left as the single pre-existing one.
    expect(await prisma.agent.count({ where: { workspaceId: WS_B, name: "Ada-2" } })).toBe(1);
    expect(await prisma.project.count({ where: { workspaceId: WS_B, name: "Apollo" } })).toBe(1);
    expect(await prisma.skill.count({ where: { workspaceId: WS_B, key: "triage" } })).toBe(1);
  });

  it("records a WorkspaceImport audit row", async () => {
    await seed(WS_A);
    const bundle = (
      await gql(`query{ exportWorkspaceBundle }`, undefined, await cookieFor(WS_A, "member"))
    ).data.exportWorkspaceBundle;
    await gql(IMPORT, { b: bundle, s: "rename" }, await cookieFor(WS_B, "admin"));
    const rows = await prisma.workspaceImport.findMany({ where: { workspaceId: WS_B } });
    expect(rows).toHaveLength(1);
    expect(rows[0].createdAgentIds).toHaveLength(1);
    expect(rows[0].importedByProfileId).toBe(humanId);
  });

  it("rejects a malformed bundle (BAD_USER_INPUT)", async () => {
    const bad = await gql(
      IMPORT,
      { b: { version: 99, agents: [], projects: [], skills: [] }, s: "rename" },
      await cookieFor(WS_B, "admin"),
    );
    expect(bad.errors).toBeDefined();
    const bad2 = await gql(
      IMPORT,
      { b: { version: 1, agents: "nope", projects: [], skills: [] }, s: "rename" },
      await cookieFor(WS_B, "admin"),
    );
    expect(bad2.errors).toBeDefined();
  });

  it("is admin-only — a member cannot import", async () => {
    await seed(WS_A);
    const bundle = (
      await gql(`query{ exportWorkspaceBundle }`, undefined, await cookieFor(WS_A, "member"))
    ).data.exportWorkspaceBundle;
    const denied = await gql(IMPORT, { b: bundle, s: "rename" }, await cookieFor(WS_B, "member"));
    expect(denied.errors).toBeDefined();
    expect(await prisma.agent.count({ where: { workspaceId: WS_B } })).toBe(0);
  });
});

describe("gate (Epic #14)", () => {
  it("rejects export when WORKSPACE_PORTABILITY is off", async () => {
    try {
      setTestFeature(FLAG_KEYS.WORKSPACE_PORTABILITY, false);
      invalidateFlagCache();
      const r = await gql(
        `query{ exportWorkspaceBundle }`,
        undefined,
        await cookieFor(WS_A, "member"),
      );
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature(FLAG_KEYS.WORKSPACE_PORTABILITY);
      invalidateFlagCache();
    }
  });
});
