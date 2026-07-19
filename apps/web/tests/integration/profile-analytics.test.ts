import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";

/**
 * Per-member analytics — real GraphQL route + Postgres. Aggregates a profile's tasks / activity /
 * cost within a workspace. Agent-profiles carry cost; a human profile is self-view only.
 */
const SECRET = "profanalytics-secret";
const WS_A = "ws_pa_A";
const WS_B = "ws_pa_B";

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

async function cookieFor(userId: string, workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

const Q = `query($p:String!){ profileAnalytics(profileId:$p){
  profileId displayName kind agentId
  tasksAssigned tasksCompleted completionRate tasksCreated activityCount
  cost{ totalTokensIn totalTokensOut totalSpendCents byModel{ model spendCents } }
} }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE cost_events, task_assignees, tasks, projects, activities, agents, profiles CASCADE`,
  );
});

async function seedAgentWithWork(ws: string) {
  const agent = await prisma.agent.create({
    data: { name: "Worker", role: "worker", workspaceId: ws },
  });
  const profile = await prisma.profile.create({
    data: { kind: "agent", displayName: "Worker", agentId: agent.id },
  });
  const project = await prisma.project.create({ data: { name: "P", workspaceId: ws } });

  // 3 assigned tasks, 2 done → completion 2/3; 1 created by the profile.
  for (const status of ["done", "done", "in_progress"]) {
    const task = await prisma.task.create({
      data: { title: "t", description: "d", status: status as never, projectId: project.id },
    });
    await prisma.taskAssignee.create({ data: { taskId: task.id, profileId: profile.id } });
  }
  await prisma.task.create({
    data: {
      title: "made",
      description: "d",
      status: "inbox",
      projectId: project.id,
      createdByProfileId: profile.id,
    },
  });
  await prisma.activity.create({
    data: { type: "task_created" as never, profileId: profile.id, message: "did a thing" },
  });
  await prisma.costEvent.createMany({
    data: [
      {
        workspaceId: ws,
        agentId: agent.id,
        model: "opus",
        tokensIn: 100,
        tokensOut: 50,
        amountCents: 300,
      },
      {
        workspaceId: ws,
        agentId: agent.id,
        model: "haiku",
        tokensIn: 20,
        tokensOut: 5,
        amountCents: 40,
      },
    ],
  });
  return { agentId: agent.id, profileId: profile.id };
}

describe("profileAnalytics", () => {
  it("aggregates an agent profile's tasks, activity and cost", async () => {
    const { profileId } = await seedAgentWithWork(WS_A);
    const r = await gql(Q, { p: profileId }, await cookieFor("human_1", WS_A, "member"));
    expect(r.errors).toBeFalsy();
    const a = r.data.profileAnalytics;
    expect(a).toMatchObject({
      kind: "agent",
      tasksAssigned: 3,
      tasksCompleted: 2,
      tasksCreated: 1,
      activityCount: 1,
    });
    expect(a.completionRate).toBeCloseTo(2 / 3, 5);
    expect(a.cost.totalSpendCents).toBe(340);
    expect(a.cost.totalTokensIn).toBe(120);
    expect(a.cost.byModel[0].model).toBe("opus"); // spend desc
  });

  it("is workspace-scoped: a caller in another workspace cannot read the agent's analytics", async () => {
    const { profileId } = await seedAgentWithWork(WS_A);
    const r = await gql(Q, { p: profileId }, await cookieFor("human_1", WS_B, "member"));
    expect(r.errors).toBeFalsy();
    expect(r.data.profileAnalytics).toBeNull();
  });

  it("unauthenticated is denied", async () => {
    const { profileId } = await seedAgentWithWork(WS_A);
    const r = await gql(Q, { p: profileId });
    expect(r.errors).toBeDefined();
    expect(r.data?.profileAnalytics).toBeFalsy();
  });
});
