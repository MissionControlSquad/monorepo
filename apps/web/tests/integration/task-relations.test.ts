import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { linkTasks, unlinkTasks, taskRelations } from "../../src/server/services/task-relations";

/**
 * Tier C: typed task dependency graph — service against real Postgres + a GraphQL round-trip and
 * feature-gate check.
 */
const SECRET = "task-relations-secret";

async function gql(query: string, variables?: Record<string, unknown>) {
  const token = await createJWT(
    { userId: "human_x", workspaceId: "ws_x", userRole: "admin" },
    SECRET,
  );
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `bb-workspace-token=${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const res = await GRAPHQL(req);
  return JSON.parse(await res.text()) as { data?: any; errors?: { message: string }[] };
}

async function makeTask(title: string): Promise<string> {
  const t = await prisma.task.create({ data: { title, description: title } });
  return t.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE tasks, task_relations, profiles CASCADE`);
});

describe("task relations service (Tier C)", () => {
  it("links two tasks; taskRelations returns it from both sides", async () => {
    const a = await makeTask("A");
    const b = await makeTask("B");
    const rel = await linkTasks({ sourceTaskId: a, targetTaskId: b, type: "blocks" });
    expect(rel.type).toBe("blocks");
    expect((await taskRelations(a)).map((r) => r.id)).toContain(rel.id);
    expect((await taskRelations(b)).map((r) => r.id)).toContain(rel.id); // inbound
  });

  it("rejects self-links, duplicates, and blocking cycles", async () => {
    const a = await makeTask("A");
    const b = await makeTask("B");
    await expect(
      linkTasks({ sourceTaskId: a, targetTaskId: a, type: "relates_to" }),
    ).rejects.toThrow(/itself/);
    await linkTasks({ sourceTaskId: a, targetTaskId: b, type: "blocks" });
    await expect(linkTasks({ sourceTaskId: a, targetTaskId: b, type: "blocks" })).rejects.toThrow(
      /already exists/,
    );
    // reverse blocks would create a cycle
    await expect(linkTasks({ sourceTaskId: b, targetTaskId: a, type: "blocks" })).rejects.toThrow(
      /cycle/,
    );
    // but a different type between the same pair is allowed
    const rel = await linkTasks({ sourceTaskId: a, targetTaskId: b, type: "relates_to" });
    expect(rel.type).toBe("relates_to");
  });

  it("requires both tasks to exist", async () => {
    const a = await makeTask("A");
    await expect(
      linkTasks({ sourceTaskId: a, targetTaskId: "nope", type: "relates_to" }),
    ).rejects.toThrow(/must exist/);
  });

  it("unlink removes the relation", async () => {
    const a = await makeTask("A");
    const b = await makeTask("B");
    const rel = await linkTasks({ sourceTaskId: a, targetTaskId: b, type: "duplicates" });
    expect(await unlinkTasks(rel.id)).toBe(true);
    expect(await taskRelations(a)).toHaveLength(0);
  });
});

describe("task relations GraphQL (Tier C)", () => {
  it("linkTasks + taskRelations + unlinkTasks round-trip", async () => {
    const a = await makeTask("A");
    const b = await makeTask("B");
    const link = await gql(
      `mutation($s:String!,$t:String!){ linkTasks(sourceTaskId:$s, targetTaskId:$t, type:"blocks"){ id type } }`,
      { s: a, t: b },
    );
    expect(link.errors).toBeFalsy();
    const relId = link.data.linkTasks.id;

    const list = await gql(
      `query($id:String!){ taskRelations(taskId:$id){ id type sourceTask { id } targetTask { id } } }`,
      { id: a },
    );
    expect(list.data.taskRelations).toHaveLength(1);
    expect(list.data.taskRelations[0].targetTask.id).toBe(b);

    const bad = await gql(
      `mutation($s:String!,$t:String!){ linkTasks(sourceTaskId:$s, targetTaskId:$t, type:"nope"){ id } }`,
      { s: a, t: b },
    );
    expect(bad.errors).toBeDefined();

    const del = await gql(`mutation($id:String!){ unlinkTasks(relationId:$id) }`, { id: relId });
    expect(del.data.unlinkTasks).toBe(true);
  });

  it("is gated by the TASK_RELATIONS feature flag", async () => {
    const a = await makeTask("A");
    const b = await makeTask("B");
    try {
      setTestFeature("task_relations", false);
      invalidateFlagCache();
      const r = await gql(
        `mutation($s:String!,$t:String!){ linkTasks(sourceTaskId:$s, targetTaskId:$t, type:"blocks"){ id } }`,
        { s: a, t: b },
      );
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature("task_relations");
      invalidateFlagCache();
    }
  });
});

describe("blocker diagnostics (Domain 8 G6.1)", () => {
  const DIAG = `query($id:String!){ blockerDiagnostics(taskId:$id){ readiness unresolvedCount reasons blockers{ taskId status source resolved } } }`;

  it("reports ready when there are no blockers", async () => {
    const t = await makeTask("free");
    const r = await gql(DIAG, { id: t });
    expect(r.data.blockerDiagnostics.readiness).toBe("ready");
    expect(r.data.blockerDiagnostics.unresolvedCount).toBe(0);
  });

  it("reports blocked with reasons from the direct edge + a blocks relation", async () => {
    const target = await makeTask("target");
    const directBlocker = await makeTask("direct"); // still in progress
    const relBlocker = await makeTask("rel");
    await prisma.task.update({
      where: { id: target },
      data: { blockedByTaskId: directBlocker, status: "in_progress" },
    });
    await prisma.task.update({ where: { id: directBlocker }, data: { status: "in_progress" } });
    // rel blocks target, but rel is done → resolved
    await linkTasks({ sourceTaskId: relBlocker, targetTaskId: target, type: "blocks" });
    await prisma.task.update({ where: { id: relBlocker }, data: { status: "done" } });

    const r = await gql(DIAG, { id: target });
    expect(r.data.blockerDiagnostics.readiness).toBe("blocked");
    expect(r.data.blockerDiagnostics.unresolvedCount).toBe(1); // only the direct one
    const byId = Object.fromEntries(
      r.data.blockerDiagnostics.blockers.map((b: any) => [b.taskId, b]),
    );
    expect(byId[directBlocker]).toMatchObject({ source: "blocked_by", resolved: false });
    expect(byId[relBlocker]).toMatchObject({ source: "relation", resolved: true });
  });

  it("becomes ready once the blocker is done", async () => {
    const target = await makeTask("t");
    const blocker = await makeTask("b");
    await prisma.task.update({ where: { id: target }, data: { blockedByTaskId: blocker } });
    await prisma.task.update({ where: { id: blocker }, data: { status: "in_progress" } });
    expect((await gql(DIAG, { id: target })).data.blockerDiagnostics.readiness).toBe("blocked");
    await prisma.task.update({ where: { id: blocker }, data: { status: "done" } });
    expect((await gql(DIAG, { id: target })).data.blockerDiagnostics.readiness).toBe("ready");
  });
});
