import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  setInboxPolicy,
  listInboxPolicies,
  deleteInboxPolicy,
  resolveInboxAction,
  DEFAULT_INBOX_ACTION,
} from "../../src/server/services/inbox-policies";

// Parity #74 — inbox-agent policy resolution.
const WS = "ws_inbox";
const AGENT = "agent_i";

beforeEach(async () => {
  await prisma.inboxPolicy.deleteMany({ where: { workspaceId: WS } });
});

describe("inbox policies (#74)", () => {
  it("creates/updates/deletes validated, workspace-scoped rules", async () => {
    const r = await setInboxPolicy({
      workspaceId: WS,
      itemKind: "task_review",
      action: "route_to_human",
      priority: 5,
    });
    expect(r).toMatchObject({ itemKind: "task_review", action: "route_to_human", priority: 5 });
    expect(await listInboxPolicies(WS)).toHaveLength(1);

    const up = await setInboxPolicy({
      id: r.id,
      workspaceId: WS,
      itemKind: "task_review",
      action: "auto_handle",
    });
    expect(up.action).toBe("auto_handle");

    await expect(
      setInboxPolicy({ workspaceId: WS, itemKind: "bogus", action: "auto_handle" }),
    ).rejects.toThrow(/itemKind/);
    await expect(
      setInboxPolicy({ workspaceId: WS, itemKind: "mention", action: "bogus" }),
    ).rejects.toThrow(/auto_handle/);

    expect(await deleteInboxPolicy(r.id, WS)).toBe(true);
    expect(await listInboxPolicies(WS)).toHaveLength(0);
  });

  it("resolves the default when no rule matches", async () => {
    const res = await resolveInboxAction(WS, AGENT, "mention");
    expect(res).toEqual({ action: DEFAULT_INBOX_ACTION, matchedRuleId: null });
  });

  it("agent-specific rules win over workspace-wide; priority breaks ties", async () => {
    // workspace-wide default for handoff
    await setInboxPolicy({
      workspaceId: WS,
      itemKind: "handoff",
      action: "route_to_human",
      priority: 0,
    });
    // agent-specific override
    const agentRule = await setInboxPolicy({
      workspaceId: WS,
      agentId: AGENT,
      itemKind: "handoff",
      action: "auto_handle",
      priority: 1,
    });

    const forAgent = await resolveInboxAction(WS, AGENT, "handoff");
    expect(forAgent).toEqual({ action: "auto_handle", matchedRuleId: agentRule.id });

    // a different agent falls back to the workspace-wide rule
    const forOther = await resolveInboxAction(WS, "agent_other", "handoff");
    expect(forOther.action).toBe("route_to_human");

    // disabled rules are ignored
    await setInboxPolicy({
      id: agentRule.id,
      workspaceId: WS,
      itemKind: "handoff",
      action: "auto_handle",
      enabled: false,
    });
    expect((await resolveInboxAction(WS, AGENT, "handoff")).action).toBe("route_to_human");
  });
});
