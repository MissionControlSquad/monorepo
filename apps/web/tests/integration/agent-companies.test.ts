import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";

/**
 * Domain 14 #10 — Agent-Companies foundation: the first-order org entity + agent binding.
 */
const SECRET = "company-test-secret";
const WS = "ws_company";
let humanId = "";

async function gql(
  query: string,
  variables?: Record<string, unknown>,
  role: "admin" | "member" = "admin",
) {
  const token = await createJWT({ userId: humanId, workspaceId: WS, userRole: role }, SECRET);
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return JSON.parse(await (await POST(req)).text()) as { data?: any; errors?: any };
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE agent_companies, agents, profiles CASCADE`);
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Founder" } });
  humanId = p.id;
  await prisma.featureFlag.upsert({
    where: { key: "agent_companies" },
    create: { key: "agent_companies", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
});

describe("agent companies (Domain 14 #10)", () => {
  const CREATE = `mutation($n:String!,$g:[String!]){ createAgentCompany(name:$n, goals:$g){ id slug name schemaVersion goals } }`;

  it("admin creates a company (slug + agentcompanies/v1); member cannot", async () => {
    const denied = await gql(CREATE, { n: "Acme AI" }, "member");
    expect(denied.errors).toBeDefined();

    const made = await gql(CREATE, { n: "Acme AI", g: ["Ship v1", "Grow"] });
    expect(made.data.createAgentCompany).toMatchObject({
      slug: "acme-ai",
      name: "Acme AI",
      schemaVersion: "agentcompanies/v1",
      goals: ["Ship v1", "Grow"],
    });
    // slug collision rejected
    const dup = await gql(CREATE, { n: "Acme AI" });
    expect(dup.errors).toBeDefined();
  });

  it("lists + reads a company; workspace-scoped", async () => {
    await gql(CREATE, { n: "Co One" });
    const list = await gql(`query{ agentCompanies{ id name } }`, undefined, "member");
    expect(list.data.agentCompanies).toHaveLength(1);
  });

  it("binds + unbinds an agent to a company (soft link cleared on delete)", async () => {
    const company = (await gql(CREATE, { n: "Bindable" })).data.createAgentCompany;
    const agent = await prisma.agent.create({
      data: { name: "Worker", role: "worker", workspaceId: WS },
    });
    const SET = `mutation($a:String!,$c:String){ setAgentCompany(agentId:$a, companyId:$c){ id companyId } }`;

    const bound = await gql(SET, { a: agent.id, c: company.id });
    expect(bound.data.setAgentCompany.companyId).toBe(company.id);

    // deleting the company clears the agent's companyId (agent survives)
    await gql(`mutation($id:String!){ deleteAgentCompany(id:$id) }`, { id: company.id });
    const after = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect(after.companyId).toBeNull();
  });

  it("updates a company's goals", async () => {
    const c = (await gql(CREATE, { n: "Updatable" })).data.createAgentCompany;
    const upd = await gql(
      `mutation($id:String!){ updateAgentCompany(id:$id, goals:["new goal"], description:"desc"){ goals description } }`,
      { id: c.id },
    );
    expect(upd.data.updateAgentCompany).toMatchObject({ goals: ["new goal"], description: "desc" });
  });
});

describe("company package export (Domain 14 #12)", () => {
  it("exports COMPANY.md + per-agent AGENTS.md + README with a Mermaid org chart", async () => {
    const company = (
      await gql(`mutation{ createAgentCompany(name:"Exportable", goals:["ship"]){ id } }`)
    ).data.createAgentCompany;

    const ceo = await prisma.agent.create({
      data: { name: "Ada", role: "ceo", workspaceId: WS, companyId: company.id },
    });
    await prisma.agent.create({
      data: {
        name: "Grace",
        role: "cto",
        workspaceId: WS,
        companyId: company.id,
        reportsToAgentId: ceo.id,
      },
    });

    const res = await gql(
      `query($id:String!){ exportCompanyPackage(companyId:$id){ path content } }`,
      { id: company.id },
      "member",
    );
    const byPath = Object.fromEntries(
      res.data.exportCompanyPackage.map((f: any) => [f.path, f.content]),
    );
    expect(byPath["COMPANY.md"]).toContain("schema: agentcompanies/v1");
    expect(byPath["COMPANY.md"]).toContain('name: "Exportable"');
    expect(byPath["agents/ada/AGENTS.md"]).toContain("# Ada");
    expect(byPath["agents/grace/AGENTS.md"]).toContain('reportsTo: "ada"');
    expect(byPath["README.md"]).toContain("```mermaid");
    expect(byPath["README.md"]).toContain("n_ada --> n_grace");
  });
});
