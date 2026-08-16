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
 * Epic #18 agent instructions — real GraphQL route + Postgres. Per-agent AGENTS.md bundles, scoped to
 * the workspace through the agent. member CRUD, AGENT_INSTRUCTIONS-gated.
 */
const SECRET = "instr-test-secret";
const WS_A = "ws_instr_A";
const WS_B = "ws_instr_B";
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
async function makeAgent(ws: string, role = "engineer") {
  const a = await prisma.agent.create({ data: { name: `${ws}-${role}`, role, workspaceId: ws } });
  return a.id;
}
const UPSERT = `mutation($a:String!,$f:String!,$c:String!){ upsertAgentInstruction(agentId:$a, fileName:$f, content:$c){ fileName content } }`;
const LIST = `query($a:String!){ agentInstructions(agentId:$a){ fileName content } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE agent_instructions, agents, profiles CASCADE`);
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Instr Human" } });
  humanId = p.id;
});

describe("agent instructions CRUD (Epic #18)", () => {
  it("upsert creates then replaces the same (agent, file); list returns the bundle", async () => {
    const agentId = await makeAgent(WS_A);
    const member = await cookieFor(WS_A, "member");
    await gql(UPSERT, { a: agentId, f: "AGENTS.md", c: "# v1" }, member);
    const replaced = await gql(UPSERT, { a: agentId, f: "AGENTS.md", c: "# v2" }, member);
    expect(replaced.data.upsertAgentInstruction.content).toBe("# v2");
    const list = await gql(LIST, { a: agentId }, member);
    expect(list.data.agentInstructions).toHaveLength(1);
    expect(list.data.agentInstructions[0]).toMatchObject({
      fileName: "AGENTS.md",
      content: "# v2",
    });
  });

  it("rejects an unsafe file name", async () => {
    const agentId = await makeAgent(WS_A);
    const bad = await gql(
      UPSERT,
      { a: agentId, f: "../escape.md", c: "x" },
      await cookieFor(WS_A, "member"),
    );
    expect(bad.errors).toBeDefined();
    expect(await prisma.agentInstruction.count()).toBe(0);
  });

  it("delete removes a file", async () => {
    const agentId = await makeAgent(WS_A);
    const member = await cookieFor(WS_A, "member");
    await gql(UPSERT, { a: agentId, f: "AGENTS.md", c: "# x" }, member);
    const del = await gql(
      `mutation($a:String!,$f:String!){ deleteAgentInstruction(agentId:$a, fileName:$f) }`,
      { a: agentId, f: "AGENTS.md" },
      member,
    );
    expect(del.data.deleteAgentInstruction).toBe(true);
    expect(await prisma.agentInstruction.count()).toBe(0);
  });

  it("seeds the default bundle (plain vs CEO) idempotently", async () => {
    const member = await cookieFor(WS_A, "member");
    const eng = await makeAgent(WS_A, "engineer");
    const ceo = await makeAgent(WS_A, "CEO");

    const seededEng = await gql(
      `mutation($a:String!){ seedAgentInstructions(agentId:$a){ fileName } }`,
      { a: eng },
      member,
    );
    expect(seededEng.data.seedAgentInstructions.map((r: any) => r.fileName)).toEqual(["AGENTS.md"]);

    const seededCeo = await gql(
      `mutation($a:String!){ seedAgentInstructions(agentId:$a){ fileName } }`,
      { a: ceo },
      member,
    );
    expect(seededCeo.data.seedAgentInstructions.map((r: any) => r.fileName).sort()).toEqual([
      "AGENTS.md",
      "HEARTBEAT.md",
      "SOUL.md",
      "TOOLS.md",
    ]);
    // Idempotent — seeding again does not duplicate.
    await gql(
      `mutation($a:String!){ seedAgentInstructions(agentId:$a){ fileName } }`,
      { a: ceo },
      member,
    );
    expect(await prisma.agentInstruction.count({ where: { agentId: ceo } })).toBe(4);
  });
});

describe("guards (Epic #18)", () => {
  it("rejects a cross-workspace agent", async () => {
    const foreignAgent = await makeAgent(WS_B);
    const denied = await gql(
      UPSERT,
      { a: foreignAgent, f: "AGENTS.md", c: "x" },
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();
  });

  it("is workspace-isolated on read", async () => {
    const foreignAgent = await makeAgent(WS_B);
    await gql(
      UPSERT,
      { a: foreignAgent, f: "AGENTS.md", c: "secret" },
      await cookieFor(WS_B, "member"),
    );
    const denied = await gql(LIST, { a: foreignAgent }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined(); // agent not in WS_A
  });

  it("rejects access when AGENT_INSTRUCTIONS is off", async () => {
    const agentId = await makeAgent(WS_A);
    try {
      setTestFeature("agent_instructions", false);
      invalidateFlagCache();
      const r = await gql(LIST, { a: agentId }, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature("agent_instructions");
      invalidateFlagCache();
    }
  });
});
