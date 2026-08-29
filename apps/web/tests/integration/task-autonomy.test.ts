import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import {
  checkoutTask,
  renewCheckout,
  releaseCheckout,
  sweepExpiredCheckouts,
} from "../../src/server/services/task-checkout";
import { getOrCreateAgentProfileId } from "../../src/server/agent-profile";
import {
  proposeDecomposition,
  reviewDecomposition,
  applyDecomposition,
} from "../../src/server/services/plan-decomposition";
import { holdSubtree, releaseSubtreeHold } from "../../src/server/services/task-tree-hold";
import { createWatchdog, evaluateWatchdogs } from "../../src/server/services/task-watchdog";
import { createTestAgent, createTestTask } from "../helpers";
import { setTestFeature, resetTestFeature } from "../../src/server/feature-flags";

/**
 * Epic #8 task autonomy — services against real Postgres (the atomic-checkout race, lease reclaim,
 * fencing, watchdog recovery, decomposition gate, subtree hold) + a GraphQL feature-gate check.
 */
const SECRET = "autonomy-test-secret";

async function makeProfile(name: string): Promise<string> {
  const p = await prisma.profile.create({ data: { kind: "human", displayName: name } });
  return p.id;
}
async function makeTask(): Promise<string> {
  const { agent } = await createTestAgent({ name: `A-${Math.random().toString(36).slice(2, 8)}` });
  const task = await createTestTask(agent.id, { title: "Work item" });
  return task.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE tasks, agents, profiles CASCADE`);
});

describe("atomic checkout", () => {
  it("two concurrent checkouts of the same free task → exactly one winner", async () => {
    const taskId = await makeTask();
    const [p1, p2] = [await makeProfile("p1"), await makeProfile("p2")];
    const results = await Promise.allSettled([
      checkoutTask(taskId, p1, 300),
      checkoutTask(taskId, p2, 300),
    ]);
    const winners = results.filter((r) => r.status === "fulfilled");
    expect(winners).toHaveLength(1);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect([p1, p2]).toContain(task.checkedOutByProfileId);
  });

  it("an expired lease is reclaimable; a live lease is not", async () => {
    const taskId = await makeTask();
    const p1 = await makeProfile("p1");
    const p2 = await makeProfile("p2");
    await checkoutTask(taskId, p1, 300);

    // Live lease → p2 refused.
    await expect(checkoutTask(taskId, p2, 300)).rejects.toThrow();

    // Expire the lease → p2 reclaims.
    await prisma.task.update({
      where: { id: taskId },
      data: { checkoutLeaseExpiresAt: new Date(Date.now() - 1000) },
    });
    const claim = await checkoutTask(taskId, p2, 300);
    expect(claim.token).toBeTruthy();
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.checkedOutByProfileId).toBe(p2);
  });

  it("renew/release require the matching fencing token", async () => {
    const taskId = await makeTask();
    const p1 = await makeProfile("p1");
    const { token } = await checkoutTask(taskId, p1, 300);

    await expect(renewCheckout(taskId, "wrong-token", 300)).rejects.toThrow();
    expect(await releaseCheckout(taskId, "wrong-token")).toBe(false);
    expect(await releaseCheckout(taskId, token)).toBe(true);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.checkedOutByProfileId).toBeNull();
  });
});

describe("watchdog recovery", () => {
  it("fires recovery when a checked-out lease has expired", async () => {
    const taskId = await makeTask();
    const p1 = await makeProfile("p1");
    await checkoutTask(taskId, p1, 300);
    await prisma.task.update({
      where: { id: taskId },
      data: { checkoutLeaseExpiresAt: new Date(Date.now() - 1000) },
    });
    await createWatchdog({
      taskId,
      condition: "lease_expired",
      thresholdSec: 0,
      action: "release_checkout",
    });

    const decisions = await evaluateWatchdogs();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].outcome).toBe("action_taken");

    const recovery = await prisma.taskRecoveryAction.findFirstOrThrow({ where: { taskId } });
    expect(recovery.status).toBe("resolved");
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.checkedOutByProfileId).toBeNull(); // checkout released by recovery

    // Idempotent: a second sweep with no new stall fires nothing.
    expect(await evaluateWatchdogs()).toHaveLength(0);
  });

  it("no_heartbeat: fires when the owning agent's heartbeat is stale (lease still live)", async () => {
    const { agent } = await createTestAgent({
      name: `HB-${Math.random().toString(36).slice(2, 8)}`,
    });
    const task = await createTestTask(agent.id, { title: "silent worker" });
    const profileId = await getOrCreateAgentProfileId(agent.id);
    await checkoutTask(task.id, profileId, 300); // lease live for 5 min → lease_expired would NOT fire
    await prisma.agent.update({
      where: { id: agent.id },
      data: { lastHeartbeat: new Date(Date.now() - 10 * 60_000) }, // 10 min stale
    });
    await createWatchdog({
      taskId: task.id,
      condition: "no_heartbeat",
      thresholdSec: 300,
      action: "release_checkout",
    });

    const decisions = await evaluateWatchdogs();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].outcome).toBe("action_taken");
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.checkedOutByProfileId).toBeNull();
  });
});

describe("expired-lease sweep", () => {
  it("releases every checkout whose lease has expired, leaves live ones alone", async () => {
    const expired = await makeTask();
    const live = await makeTask();
    const p1 = await makeProfile("sweeper1");
    const p2 = await makeProfile("sweeper2");
    await checkoutTask(expired, p1, 300);
    await checkoutTask(live, p2, 300);
    await prisma.task.update({
      where: { id: expired },
      data: { checkoutLeaseExpiresAt: new Date(Date.now() - 1000) },
    });

    const released = await sweepExpiredCheckouts(new Date());
    expect(released).toBe(1);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: expired } })).checkedOutByProfileId,
    ).toBeNull();
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: live } })).checkedOutByProfileId,
    ).toBe(p2);
  });
});

describe("plan decomposition review gate", () => {
  it("applies child tasks only after approval; rejected/unreviewed cannot apply", async () => {
    const parentId = await makeTask();
    const human = await makeProfile("reviewer");
    const plan = [
      { title: "Sub A", description: "do a" },
      { title: "Sub B", description: "do b", priority: "high" },
    ];

    const dec = await proposeDecomposition({ parentTaskId: parentId, plan });
    // Cannot apply while only proposed.
    await expect(applyDecomposition(dec.id)).rejects.toThrow();

    await reviewDecomposition({ id: dec.id, decision: "approve", reviewedByProfileId: human });
    const { taskIds } = await applyDecomposition(dec.id);
    expect(taskIds).toHaveLength(2);
    const children = await prisma.task.findMany({ where: { parentTaskId: parentId } });
    expect(children).toHaveLength(2);

    // A rejected proposal creates nothing.
    const dec2 = await proposeDecomposition({ parentTaskId: parentId, plan });
    await reviewDecomposition({ id: dec2.id, decision: "reject", reviewedByProfileId: human });
    await expect(applyDecomposition(dec2.id)).rejects.toThrow();
  });
});

describe("subtree hold", () => {
  it("blocks checkout on a descendant until released", async () => {
    const rootId = await makeTask();
    const child = await prisma.task.create({
      data: { title: "child", description: "c", parentTaskId: rootId },
    });
    const p1 = await makeProfile("p1");

    await holdSubtree(rootId, "manual pause");
    await expect(checkoutTask(child.id, p1, 300)).rejects.toThrow(/subtree hold/i);

    await releaseSubtreeHold(rootId);
    const claim = await checkoutTask(child.id, p1, 300);
    expect(claim.token).toBeTruthy();
  });
});

describe("feature gate (GraphQL)", () => {
  it("pendingDecompositions is rejected when TASK_AUTONOMY is off", async () => {
    const { invalidateFlagCache } = await import("../../src/server/feature-flags");
    const token = await createJWT({ userId: "u", workspaceId: "ws", userRole: "admin" }, SECRET);
    const cookie = `bb-workspace-token=${token}`;
    try {
      setTestFeature(FLAG_KEYS.TASK_AUTONOMY, false);
      invalidateFlagCache();
      const req = new Request("http://test/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ query: `query{ pendingDecompositions{ id } }` }),
      });
      const res = await GRAPHQL(req);
      const json = JSON.parse(await res.text());
      expect(json.errors).toBeDefined();
    } finally {
      resetTestFeature(FLAG_KEYS.TASK_AUTONOMY);
      invalidateFlagCache();
    }
  });
});

describe("typed thread interactions (Domain 8 G6.5)", () => {
  async function tiGql(query: string, variables?: Record<string, unknown>) {
    const { invalidateFlagCache } = await import("../../src/server/feature-flags");
    setTestFeature(FLAG_KEYS.THREAD_INTERACTIONS, true);
    invalidateFlagCache();
    const token = await createJWT({ userId: "u", workspaceId: "ws", userRole: "member" }, SECRET);
    const req = new Request("http://test/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
      body: JSON.stringify({ query, variables }),
    });
    return JSON.parse(await (await GRAPHQL(req)).text()) as { data?: any; errors?: any };
  }

  it("creates a request_confirmation, lists it pending, then resolves it", async () => {
    const taskId = await makeTask();
    const created = await tiGql(
      `mutation($t:String!,$p:JSON!){ createThreadInteraction(taskId:$t, kind:"request_confirmation", payload:$p){ id kind status } }`,
      { t: taskId, p: { question: "Deploy to prod?" } },
    );
    expect(created.data.createThreadInteraction).toMatchObject({
      kind: "request_confirmation",
      status: "pending",
    });
    const id = created.data.createThreadInteraction.id;

    const list = await tiGql(
      `query($t:String!){ threadInteractions(taskId:$t, status:"pending"){ id kind } }`,
      { t: taskId },
    );
    expect(list.data.threadInteractions).toHaveLength(1);

    const resolved = await tiGql(
      `mutation($id:String!,$r:JSON){ resolveThreadInteraction(id:$id, decision:"resolved", result:$r){ status result } }`,
      { id, r: { approved: true } },
    );
    expect(resolved.data.resolveThreadInteraction).toMatchObject({ status: "resolved" });
    expect(resolved.data.resolveThreadInteraction.result).toMatchObject({ approved: true });

    // a second resolve on a non-pending interaction is rejected
    const again = await tiGql(
      `mutation($id:String!){ resolveThreadInteraction(id:$id, decision:"dismissed"){ status } }`,
      { id },
    );
    expect(again.errors).toBeDefined();
  });

  it("rejects an unknown interaction kind", async () => {
    const taskId = await makeTask();
    const bad = await tiGql(
      `mutation($t:String!,$p:JSON!){ createThreadInteraction(taskId:$t, kind:"nonsense", payload:$p){ id } }`,
      { t: taskId, p: {} },
    );
    expect(bad.errors).toBeDefined();
  });
});

describe("cancel task (Domain 8 G6.7)", () => {
  async function memberGql(query: string, variables?: Record<string, unknown>) {
    const token = await createJWT({ userId: "u", workspaceId: "ws", userRole: "member" }, SECRET);
    const req = new Request("http://test/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
      body: JSON.stringify({ query, variables }),
    });
    return JSON.parse(await (await GRAPHQL(req)).text()) as { data?: any; errors?: any };
  }

  it("cancels an active task (status cancelled + cancelledAt set)", async () => {
    const taskId = await makeTask();
    const r = await memberGql(
      `mutation($id:String!){ cancelTask(taskId:$id){ id status cancelledAt } }`,
      { id: taskId },
    );
    expect(r.data.cancelTask).toMatchObject({ status: "cancelled" });
    expect(r.data.cancelTask.cancelledAt).toBeTruthy();
  });

  it("refuses to cancel a done or already-cancelled task", async () => {
    const taskId = await makeTask();
    await prisma.task.update({ where: { id: taskId }, data: { status: "done" } });
    const r = await memberGql(`mutation($id:String!){ cancelTask(taskId:$id){ id } }`, {
      id: taskId,
    });
    expect(r.errors).toBeDefined();
  });
});

describe("subtree cancel / restore (Domain 8 G6.6)", () => {
  async function adminGql(query: string, variables?: Record<string, unknown>) {
    const { invalidateFlagCache } = await import("../../src/server/feature-flags");
    resetTestFeature(FLAG_KEYS.TASK_AUTONOMY);
    invalidateFlagCache();
    const token = await createJWT({ userId: "u", workspaceId: "ws", userRole: "admin" }, SECRET);
    const req = new Request("http://test/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
      body: JSON.stringify({ query, variables }),
    });
    return JSON.parse(await (await GRAPHQL(req)).text()) as { data?: any; errors?: any };
  }

  it("cancels a subtree (root + descendants, skipping done) and restores it", async () => {
    const root = await makeTask();
    const child = await prisma.task.create({
      data: { title: "c", description: "d", parentTaskId: root },
    });
    const grandchild = await prisma.task.create({
      data: { title: "gc", description: "d", parentTaskId: child.id, status: "done" },
    });

    const cancel = await adminGql(`mutation($r:String!){ cancelSubtree(rootTaskId:$r) }`, {
      r: root,
    });
    expect(cancel.data.cancelSubtree).toBe(2); // root + child; the done grandchild is skipped
    expect((await prisma.task.findUniqueOrThrow({ where: { id: root } })).status).toBe("cancelled");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: child.id } })).status).toBe(
      "cancelled",
    );
    expect((await prisma.task.findUniqueOrThrow({ where: { id: grandchild.id } })).status).toBe(
      "done",
    );

    const restore = await adminGql(`mutation($r:String!){ restoreSubtree(rootTaskId:$r) }`, {
      r: root,
    });
    expect(restore.data.restoreSubtree).toBe(2);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: root } })).status).toBe("assigned");
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: child.id } })).cancelledAt,
    ).toBeNull();
  });
});
