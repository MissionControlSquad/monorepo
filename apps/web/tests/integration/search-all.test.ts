import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";

/**
 * Full-page search (searchAll) — real GraphQL route + Postgres full-text. Workspace-scoped across
 * tasks/agents/projects/goals (and messages/deliverables via their task's project).
 */
const SECRET = "searchall-secret";
const WS_A = "ws_search_A";
const WS_B = "ws_search_B";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text ? (JSON.parse(text) as { data?: any; errors?: any[] }) : { errors: [] };
}
async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: "human_1", workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

const Q = `query($s:String!){ searchAll(searchText:$s){
  tasks messages deliverables agents projects goals } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE goals, tasks, projects, agents CASCADE`);
});

async function seed(ws: string, marker: string) {
  await prisma.agent.create({ data: { name: `${marker}bot`, role: "worker", workspaceId: ws } });
  const project = await prisma.project.create({
    data: { name: `${marker}project`, workspaceId: ws },
  });
  await prisma.task.create({
    data: { title: `${marker}task`, description: "d", projectId: project.id },
  });
  await prisma.goal.create({ data: { title: `${marker}goal`, workspaceId: ws } });
}

describe("searchAll", () => {
  it("finds matching entities across scopes in the caller's workspace", async () => {
    await seed(WS_A, "zephyr");
    const r = await gql(Q, { s: "zephyr" }, await cookieFor(WS_A, "member"));
    expect(r.errors).toBeFalsy();
    const s = r.data.searchAll;
    expect(s.agents).toHaveLength(1);
    expect(s.projects).toHaveLength(1);
    expect(s.tasks).toHaveLength(1);
    expect(s.goals).toHaveLength(1);
    expect(s.agents[0].name).toBe("zephyrbot");
  });

  it("is workspace-scoped — another workspace's matches are not returned", async () => {
    await seed(WS_A, "quartz");
    const r = await gql(Q, { s: "quartz" }, await cookieFor(WS_B, "member"));
    expect(r.errors).toBeFalsy();
    const s = r.data.searchAll;
    expect(s.agents).toHaveLength(0);
    expect(s.projects).toHaveLength(0);
    expect(s.goals).toHaveLength(0);
  });

  it("returns empty for a blank/too-short query and denies the unauthenticated", async () => {
    await seed(WS_A, "nimbus");
    const blank = await gql(Q, { s: "   " }, await cookieFor(WS_A, "member"));
    expect(blank.data.searchAll.agents).toHaveLength(0);

    const anon = await gql(Q, { s: "nimbus" });
    expect(anon.errors).toBeDefined();
    expect(anon.data?.searchAll).toBeFalsy();
  });
});
