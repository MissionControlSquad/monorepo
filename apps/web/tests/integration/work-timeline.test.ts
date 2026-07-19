import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";

/**
 * Work timeline (Gantt) — real GraphQL route + Postgres. Completed WorkSession spans, workspace-scoped
 * via the agent; excludes in-progress (endedAt null) sessions.
 */
const SECRET = "wtimeline-secret";
const WS_A = "ws_wt_A";
const WS_B = "ws_wt_B";

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
const Q = `query{ workTimeline{ id agentName taskTitle startedAt endedAt } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE work_sessions, tasks, projects, agents CASCADE`);
});

async function seed(ws: string, agentName: string, ended: boolean) {
  const agent = await prisma.agent.create({
    data: { name: agentName, role: "worker", workspaceId: ws },
  });
  const project = await prisma.project.create({ data: { name: "P", workspaceId: ws } });
  const task = await prisma.task.create({
    data: { title: "Build it", description: "d", projectId: project.id },
  });
  await prisma.workSession.create({
    data: {
      agentId: agent.id,
      taskId: task.id,
      projectId: project.id,
      eventType: "completed",
      startedAt: new Date("2026-07-01T10:00:00Z"),
      endedAt: ended ? new Date("2026-07-01T11:00:00Z") : null,
    },
  });
}

describe("workTimeline", () => {
  it("returns completed spans for the workspace and excludes in-progress ones", async () => {
    await seed(WS_A, "Nova", true);
    await seed(WS_A, "Rex", false); // no endedAt → excluded
    const r = await gql(Q, undefined, await cookieFor(WS_A, "member"));
    expect(r.errors).toBeFalsy();
    expect(r.data.workTimeline).toHaveLength(1);
    expect(r.data.workTimeline[0]).toMatchObject({ agentName: "Nova", taskTitle: "Build it" });
  });

  it("is workspace-scoped and denies the unauthenticated", async () => {
    await seed(WS_A, "Nova", true);
    const other = await gql(Q, undefined, await cookieFor(WS_B, "member"));
    expect(other.data.workTimeline).toHaveLength(0);

    const anon = await gql(Q);
    expect(anon.errors).toBeDefined();
    expect(anon.data?.workTimeline).toBeFalsy();
  });
});
