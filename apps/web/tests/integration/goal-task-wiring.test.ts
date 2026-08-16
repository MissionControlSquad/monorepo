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
 * Epic #11b: goals wired into tasks. createTask auto-resolves the goal (explicit → project default →
 * workspace default company goal), via the shared resolveIssueGoalId. GOALS off → no auto-assign.
 */
const SECRET = "goaltask-test-secret";
const WS_A = "ws_gt_A";
const WS_B = "ws_gt_B";
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
async function cookieFor(workspaceId: string) {
  const token = await createJWT({ userId: humanId, workspaceId, userRole: "member" }, SECRET);
  return `bb-workspace-token=${token}`;
}
async function companyGoal(ws: string, title = "Company OKR") {
  return prisma.goal.create({
    data: { workspaceId: ws, title, level: "company", status: "active" },
  });
}
const CREATE = `mutation($t:String!,$d:String!,$p:String,$g:String){ createTask(title:$t, description:$d, assigneeIds:[], projectId:$p, goalId:$g){ id goalId projectId } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE tasks, goals, projects, agents, profiles CASCADE`);
  resetTestFeature("goals");
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "GT Human" } });
  humanId = p.id;
});

describe("createTask goal auto-resolution (Epic #11b)", () => {
  it("inherits the workspace default company goal when none is specified", async () => {
    const g = await companyGoal(WS_A);
    const r = await gql(CREATE, { t: "Do it", d: "desc" }, await cookieFor(WS_A));
    expect(r.errors).toBeFalsy();
    expect(r.data.createTask.goalId).toBe(g.id);
  });

  it("inherits the project's default goal over the workspace default", async () => {
    await companyGoal(WS_A, "workspace default");
    const projGoal = await prisma.goal.create({
      data: { workspaceId: WS_A, title: "project goal", level: "team" },
    });
    const project = await prisma.project.create({
      data: { name: "P", workspaceId: WS_A, goalId: projGoal.id },
    });
    const r = await gql(CREATE, { t: "T", d: "d", p: project.id }, await cookieFor(WS_A));
    expect(r.data.createTask.goalId).toBe(projGoal.id);
  });

  it("an explicit goalId wins over everything", async () => {
    await companyGoal(WS_A);
    const explicit = await prisma.goal.create({ data: { workspaceId: WS_A, title: "explicit" } });
    const r = await gql(CREATE, { t: "T", d: "d", g: explicit.id }, await cookieFor(WS_A));
    expect(r.data.createTask.goalId).toBe(explicit.id);
  });

  it("leaves goalId null when the workspace has no company goal", async () => {
    const r = await gql(CREATE, { t: "T", d: "d" }, await cookieFor(WS_A));
    expect(r.data.createTask.goalId).toBeNull();
  });

  it("does not auto-assign when GOALS is disabled", async () => {
    await companyGoal(WS_A);
    setTestFeature("goals", false);
    invalidateFlagCache();
    const r = await gql(CREATE, { t: "T", d: "d" }, await cookieFor(WS_A));
    expect(r.data.createTask.goalId).toBeNull();
  });
});

describe("setProjectDefaultGoal (Epic #11b)", () => {
  const SET = `mutation($p:String!,$g:String){ setProjectDefaultGoal(projectId:$p, goalId:$g){ id defaultGoalId } }`;

  it("sets then clears a project's default goal", async () => {
    const goal = await prisma.goal.create({ data: { workspaceId: WS_A, title: "g" } });
    const project = await prisma.project.create({ data: { name: "P", workspaceId: WS_A } });
    const set = await gql(SET, { p: project.id, g: goal.id }, await cookieFor(WS_A));
    expect(set.data.setProjectDefaultGoal.defaultGoalId).toBe(goal.id);
    const cleared = await gql(SET, { p: project.id }, await cookieFor(WS_A));
    expect(cleared.data.setProjectDefaultGoal.defaultGoalId).toBeNull();
  });

  it("rejects a cross-workspace goal", async () => {
    const foreignGoal = await prisma.goal.create({ data: { workspaceId: WS_B, title: "b" } });
    const project = await prisma.project.create({ data: { name: "P", workspaceId: WS_A } });
    const r = await gql(SET, { p: project.id, g: foreignGoal.id }, await cookieFor(WS_A));
    expect(r.errors).toBeDefined();
  });
});
