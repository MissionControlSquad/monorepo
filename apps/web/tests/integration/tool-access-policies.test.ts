import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  listToolAccessPolicies,
  setToolAccessPolicy,
  deleteToolAccessPolicy,
  resolveToolAccess,
} from "../../src/server/services/tool-access-policies";

// Parity #21 — tool access-policy storage + resolution against real Postgres.
const WS = "ws_tool";

beforeEach(async () => {
  await prisma.toolAccessPolicy.deleteMany({ where: { workspaceId: WS } });
});

describe("tool access-policy service (#21)", () => {
  it("creates, lists, updates and deletes policies (workspace-scoped)", async () => {
    const created = await setToolAccessPolicy({
      workspaceId: WS,
      toolPattern: "shell.*",
      effect: "deny",
      priority: 10,
      reason: "no shell",
    });
    expect(created).toMatchObject({ workspaceId: WS, effect: "deny", priority: 10 });

    const list = await listToolAccessPolicies(WS);
    expect(list).toHaveLength(1);

    const updated = await setToolAccessPolicy({
      id: created.id,
      workspaceId: WS,
      toolPattern: "shell.*",
      effect: "allow",
      priority: 5,
    });
    expect(updated).toMatchObject({ id: created.id, effect: "allow", priority: 5 });

    expect(await deleteToolAccessPolicy(created.id, WS)).toBe(true);
    expect(await listToolAccessPolicies(WS)).toHaveLength(0);
  });

  it("coerces an invalid effect to 'allow' and rejects an empty pattern", async () => {
    const p = await setToolAccessPolicy({
      workspaceId: WS,
      toolPattern: "x",
      effect: "nonsense",
    });
    expect(p.effect).toBe("allow");
    await expect(
      setToolAccessPolicy({ workspaceId: WS, toolPattern: "  ", effect: "deny" }),
    ).rejects.toThrow(/toolPattern/);
  });

  it("resolves a decision: workspace deny + agent-scoped allow override", async () => {
    await setToolAccessPolicy({
      workspaceId: WS,
      toolPattern: "github.*",
      effect: "deny",
      priority: 100,
    });
    await setToolAccessPolicy({
      workspaceId: WS,
      agentId: "agent_a",
      toolPattern: "github.*",
      effect: "allow",
      priority: 0,
    });

    // agent_a: the agent-scoped allow wins over the workspace deny
    expect(await resolveToolAccess(WS, "agent_a", "github.create_pr")).toMatchObject({
      decision: "allow",
    });
    // another agent: only the workspace deny applies
    expect(await resolveToolAccess(WS, "agent_b", "github.create_pr")).toMatchObject({
      decision: "deny",
    });
    // unmatched tool → default allow
    expect(await resolveToolAccess(WS, "agent_b", "fs.read")).toMatchObject({
      decision: "allow",
      matchedRuleId: null,
    });
  });

  it("does not touch another workspace's policies on update/delete", async () => {
    const mine = await setToolAccessPolicy({ workspaceId: WS, toolPattern: "a", effect: "deny" });
    await expect(
      setToolAccessPolicy({ id: mine.id, workspaceId: "ws_other", toolPattern: "a", effect: "allow" }),
    ).rejects.toThrow(/not found/);
    expect(await deleteToolAccessPolicy(mine.id, "ws_other")).toBe(false);
    expect(await listToolAccessPolicies(WS)).toHaveLength(1);
  });
});
