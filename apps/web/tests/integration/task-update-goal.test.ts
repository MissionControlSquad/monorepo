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

/**
 * Epic #11c: goal re-resolution on task update (resolveNextIssueGoalId). Explicit goal set/clear,
 * project assignment inherits the project's default goal, and an explicit goal survives a later change.
 */
const SECRET = "taskgoal-test-secret";
const WS_A = "ws_tug_A";
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
async function cookie() {
  const token = await createJWT({ userId: humanId, workspaceId: WS_A, userRole: "member" }, SECRET);
  return `bb-workspace-token=${token}`;
}
const CREATE = `mutation($t:String!,$d:String!){ createTask(title:$t, description:$d, assigneeIds:[]){ id goalId } }`;
const UPDATE = `mutation($id:String!,$g:String,$c:Boolean,$p:String){ updateTask(id:$id, goalId:$g, clearGoal:$c, projectId:$p){ id goalId projectId } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE tasks, goals, projects, agents, profiles CASCADE`);
  resetTestFeature(FLAG_KEYS.GOALS);
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "TUG Human" } });
  humanId = p.id;
});

describe("goal re-resolution on task update (Epic #11c)", () => {
  it("sets and clears an explicit goal", async () => {
    const c = await cookie();
    const goal = await prisma.goal.create({ data: { workspaceId: WS_A, title: "G" } });
    const task = (await gql(CREATE, { t: "T", d: "d" }, c)).data.createTask;
    expect(task.goalId).toBeNull(); // no company goal → none

    const set = await gql(UPDATE, { id: task.id, g: goal.id }, c);
    expect(set.data.updateTask.goalId).toBe(goal.id);

    const cleared = await gql(UPDATE, { id: task.id, c: true }, c);
    expect(cleared.data.updateTask.goalId).toBeNull();
  });

  it("inherits the project's default goal when a project is assigned later", async () => {
    const c = await cookie();
    const projGoal = await prisma.goal.create({ data: { workspaceId: WS_A, title: "PG" } });
    const project = await prisma.project.create({
      data: { name: "P", workspaceId: WS_A, goalId: projGoal.id },
    });
    // task starts with no project + no goal
    const task = (await gql(CREATE, { t: "T", d: "d" }, c)).data.createTask;
    expect(task.goalId).toBeNull();

    const updated = await gql(UPDATE, { id: task.id, p: project.id }, c);
    expect(updated.data.updateTask.projectId).toBe(project.id);
    expect(updated.data.updateTask.goalId).toBe(projGoal.id);
  });

  it("preserves an explicit goal across a later project assignment", async () => {
    const c = await cookie();
    const explicit = await prisma.goal.create({ data: { workspaceId: WS_A, title: "explicit" } });
    const projGoal = await prisma.goal.create({ data: { workspaceId: WS_A, title: "PG" } });
    const project = await prisma.project.create({
      data: { name: "P", workspaceId: WS_A, goalId: projGoal.id },
    });
    const task = (await gql(CREATE, { t: "T", d: "d" }, c)).data.createTask;
    await gql(UPDATE, { id: task.id, g: explicit.id }, c); // explicit goal

    const updated = await gql(UPDATE, { id: task.id, p: project.id }, c); // assign project
    expect(updated.data.updateTask.goalId).toBe(explicit.id); // explicit wins
  });

  it("does not re-resolve when GOALS is disabled", async () => {
    const c = await cookie();
    const goal = await prisma.goal.create({ data: { workspaceId: WS_A, title: "G" } });
    const task = (await gql(CREATE, { t: "T", d: "d" }, c)).data.createTask;
    setTestFeature(FLAG_KEYS.GOALS, false);
    invalidateFlagCache();
    // With GOALS off, an explicit goalId is still honored (it's the caller's intent), but no inheritance.
    const set = await gql(UPDATE, { id: task.id, g: goal.id }, c);
    expect(set.data.updateTask.goalId).toBe(goal.id);
  });
});
