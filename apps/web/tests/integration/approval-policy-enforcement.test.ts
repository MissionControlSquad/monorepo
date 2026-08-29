import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { randomUUID } from "node:crypto";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { setAgentGovernance } from "../../src/server/services/agent-governance";
import { setApprovalPolicy, requestAgentAction } from "../../src/server/services/approval-policies";

/**
 * Rule-based approval-policy engine — CRUD + enforcement in the approval path. Real GraphQL route +
 * Postgres. GOVERNANCE-gated; admin manages policies; the engine decides allow / require_approval /
 * deny, and falls back to the existing coarse requireAgentApproval knob when NO policy matches.
 */
const SECRET = "approval-policy-secret";
const WS_A = "ws_ap_A";
const WS_B = "ws_ap_B";
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
async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: humanId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}
async function setGovernance(enabled: boolean) {
  setTestFeature(FLAG_KEYS.GOVERNANCE, enabled);
  invalidateFlagCache();
}
async function makeAgent(workspaceId: string, over: { role?: string; trustLevel?: any } = {}) {
  return prisma.agent.create({
    data: {
      name: "Agent",
      role: over.role ?? "engineer",
      workspaceId,
      username: `agent-${randomUUID().slice(0, 8)}`,
      ...(over.trustLevel ? { trustLevel: over.trustLevel } : {}),
    },
  });
}

const SET = `mutation($id:String,$n:String!,$a:String!,$e:String!,$p:Int,$s:JSON,$c:JSON,$en:Boolean){
  setApprovalPolicy(id:$id,name:$n,action:$a,effect:$e,priority:$p,subject:$s,condition:$c,enabled:$en){ id name action effect priority enabled } }`;
const LIST = `query{ approvalPolicies{ id name action effect priority enabled } }`;
const DELETE = `mutation($id:String!){ deleteApprovalPolicy(id:$id) }`;
const REQUEST = `mutation($a:String!,$ag:String,$cc:Int){ requestAgentAction(action:$a, agentId:$ag, costCents:$cc){ status matchedPolicyId approvalId } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE approval_policies, approvals, agents, agent_governance_policies, profiles CASCADE`,
  );
  resetTestFeature(FLAG_KEYS.GOVERNANCE);
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "AP Human" } });
  humanId = p.id;
});

describe("approval-policy CRUD (GraphQL)", () => {
  it("creates, lists, updates, and deletes a policy (admin)", async () => {
    await setGovernance(true);
    const admin = await cookieFor(WS_A, "admin");

    const created = await gql(
      SET,
      { n: "Gate runs", a: "run", e: "require_approval", p: 5 },
      admin,
    );
    expect(created.errors).toBeFalsy();
    const id = created.data.setApprovalPolicy.id;
    expect(created.data.setApprovalPolicy).toMatchObject({
      action: "run",
      effect: "require_approval",
    });

    const listed = await gql(LIST, undefined, admin);
    expect(listed.data.approvalPolicies).toHaveLength(1);

    const updated = await gql(SET, { id, n: "Gate runs", a: "run", e: "deny", p: 9 }, admin);
    expect(updated.data.setApprovalPolicy).toMatchObject({ effect: "deny", priority: 9 });

    const del = await gql(DELETE, { id }, admin);
    expect(del.data.deleteApprovalPolicy).toBe(true);
    const after = await gql(LIST, undefined, admin);
    expect(after.data.approvalPolicies).toHaveLength(0);
  });

  it("rejects an invalid effect and is admin-only + GOVERNANCE-gated", async () => {
    await setGovernance(true);
    const bad = await gql(SET, { n: "x", a: "run", e: "maybe" }, await cookieFor(WS_A, "admin"));
    expect(bad.errors).toBeDefined();
    // GraphQL masks messages app-wide; assert the readable reason at the service layer.
    await expect(
      setApprovalPolicy({ workspaceId: WS_A, name: "x", action: "run", effect: "maybe" }),
    ).rejects.toThrow(/effect must be one of/);

    const member = await gql(SET, { n: "x", a: "run", e: "deny" }, await cookieFor(WS_A, "member"));
    expect(member.errors).toBeDefined();

    await setGovernance(false);
    const gated = await gql(SET, { n: "x", a: "run", e: "deny" }, await cookieFor(WS_A, "admin"));
    expect(gated.errors).toBeDefined();
  });

  it("is workspace-isolated — WS_A cannot see WS_B's policies", async () => {
    await setGovernance(true);
    await gql(SET, { n: "B only", a: "run", e: "deny" }, await cookieFor(WS_B, "admin"));
    const listA = await gql(LIST, undefined, await cookieFor(WS_A, "admin"));
    expect(listA.data.approvalPolicies).toHaveLength(0);
  });
});

describe("approval-policy enforcement (approval path)", () => {
  it("a require_approval policy creates a pending Approval", async () => {
    await setGovernance(true);
    const admin = await cookieFor(WS_A, "admin");
    const agent = await makeAgent(WS_A);
    await gql(SET, { n: "Gate runs", a: "run", e: "require_approval" }, admin);

    const res = await gql(REQUEST, { a: "run", ag: agent.id }, admin);
    expect(res.errors).toBeFalsy();
    expect(res.data.requestAgentAction.status).toBe("require_approval");
    const approvalId = res.data.requestAgentAction.approvalId;
    expect(approvalId).toBeTruthy();

    const approval = await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } });
    expect(approval).toMatchObject({
      workspaceId: WS_A,
      status: "pending",
      subjectType: "agent_action",
    });
  });

  it("a deny policy refuses with a readable reason and creates NO approval", async () => {
    await setGovernance(true);
    const admin = await cookieFor(WS_A, "admin");
    const agent = await makeAgent(WS_A);
    await gql(
      SET,
      { n: "No spending", a: "spend_over", e: "deny", c: { costCentsOver: 5000 } },
      admin,
    );

    const res = await gql(REQUEST, { a: "spend_over", ag: agent.id, cc: 6000 }, admin);
    expect(res.errors).toBeDefined();
    expect(await prisma.approval.count()).toBe(0);
    // GraphQL masks messages app-wide; assert the readable denial reason at the service layer.
    await expect(
      requestAgentAction({
        workspaceId: WS_A,
        action: "spend_over",
        agentId: agent.id,
        costCents: 6000,
        requestedById: humanId,
      }),
    ).rejects.toThrow(/denied by approval policy "No spending"/);
    expect(await prisma.approval.count()).toBe(0);
  });

  it("condition below threshold does NOT match → falls back to coarse (off ⇒ allow)", async () => {
    await setGovernance(true);
    const admin = await cookieFor(WS_A, "admin");
    const agent = await makeAgent(WS_A);
    await gql(
      SET,
      { n: "No spending", a: "spend_over", e: "deny", c: { costCentsOver: 5000 } },
      admin,
    );

    // 100 < 5000 → policy skipped → default; coarse requireAgentApproval is off → allow.
    const res = await gql(REQUEST, { a: "spend_over", ag: agent.id, cc: 100 }, admin);
    expect(res.errors).toBeFalsy();
    expect(res.data.requestAgentAction.status).toBe("default");
    expect(await prisma.approval.count()).toBe(0);
  });

  it("NO matching policy falls back to the existing coarse requireAgentApproval knob", async () => {
    await setGovernance(true);
    const admin = await cookieFor(WS_A, "admin");
    const agent = await makeAgent(WS_A);

    // Coarse off, no policies → allow (existing default behavior).
    const off = await gql(REQUEST, { a: "run", ag: agent.id }, admin);
    expect(off.data.requestAgentAction.status).toBe("default");
    expect(await prisma.approval.count()).toBe(0);

    // Coarse on, still no policies → the coarse knob now requires approval (fallback preserved).
    await setAgentGovernance(WS_A, { requireAgentApproval: true });
    const on = await gql(REQUEST, { a: "run", ag: agent.id }, admin);
    expect(on.data.requestAgentAction.status).toBe("require_approval");
    expect(await prisma.approval.count()).toBe(1);
  });

  it("a matched allow policy proceeds even when coarse approval is on (whitelist)", async () => {
    await setGovernance(true);
    const admin = await cookieFor(WS_A, "admin");
    const agent = await makeAgent(WS_A, { role: "trusted-runner" });
    await setAgentGovernance(WS_A, { requireAgentApproval: true });
    await gql(
      SET,
      { n: "Trusted runners", a: "run", e: "allow", p: 10, s: { roles: ["trusted-runner"] } },
      admin,
    );

    const res = await gql(REQUEST, { a: "run", ag: agent.id }, admin);
    expect(res.data.requestAgentAction).toMatchObject({ status: "allow" });
    expect(await prisma.approval.count()).toBe(0); // allow policy beat the coarse knob
  });
});
